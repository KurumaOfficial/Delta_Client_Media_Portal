package uploads

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"

	"dmr/config"
)

var (
	cfgMu     sync.RWMutex
	uploadCfg *config.Config
	mergeLock sync.Mutex
)

// Init инициализирует каталоги для загрузки файлов.
func Init(cfg *config.Config) error {
	cfgMu.Lock()
	uploadCfg = cfg
	cfgMu.Unlock()

	tempDir := filepath.Join(cfg.UploadDir, "temp")
	proofsDir := filepath.Join(cfg.UploadDir, "proofs")

	if err := os.MkdirAll(tempDir, 0755); err != nil {
		return fmt.Errorf("mkdir temp: %w", err)
	}
	if err := os.MkdirAll(proofsDir, 0755); err != nil {
		return fmt.Errorf("mkdir proofs: %w", err)
	}
	return nil
}

func getCfg() *config.Config {
	cfgMu.RLock()
	defer cfgMu.RUnlock()
	return uploadCfg
}

// InitUpload подготавливает сессию чанковой загрузки.
func InitUpload(c *fiber.Ctx) error {
	var body struct {
		FileName string `json:"file_name"`
		FileSize int64  `json:"file_size"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Неверное тело запроса"})
	}

	cfg := getCfg()
	if cfg != nil && cfg.MaxUploadGB > 0 {
		maxBytes := cfg.MaxUploadGB * 1024 * 1024 * 1024
		if body.FileSize > maxBytes {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": fmt.Sprintf("Файл превышает лимит %d ГБ", cfg.MaxUploadGB),
			})
		}
	}

	uploadID := fmt.Sprintf("%d_%s", time.Now().UnixNano(), filepath.Base(body.FileName))
	chunkSize := int64(5 * 1024 * 1024) // 5 МБ
	totalChunks := int((body.FileSize + chunkSize - 1) / chunkSize)
	if totalChunks <= 0 {
		totalChunks = 1
	}

	return c.JSON(fiber.Map{
		"success":      true,
		"upload_id":    uploadID,
		"chunk_size":   chunkSize,
		"total_chunks": totalChunks,
	})
}

// UploadChunk принимает один чанк (5 МБ) и потоково пишет на диск.
func UploadChunk(c *fiber.Ctx) error {
	uploadID := c.FormValue("upload_id")
	chunkIndexStr := c.FormValue("chunk_index")
	totalChunksStr := c.FormValue("total_chunks")
	fileName := c.FormValue("file_name")

	if uploadID == "" || chunkIndexStr == "" || totalChunksStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Отсутствуют метаданные чанка"})
	}

	chunkIndex, err := strconv.Atoi(chunkIndexStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Неверный индекс чанка"})
	}

	totalChunks, err := strconv.Atoi(totalChunksStr)
	if err != nil || totalChunks <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Неверное общее число чанков"})
	}

	fileHeader, err := c.FormFile("chunk")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Файл чанка не получен"})
	}

	file, err := fileHeader.Open()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Ошибка открытия чанка"})
	}
	defer file.Close()

	cfg := getCfg()
	uploadDir := "./uploads"
	if cfg != nil && cfg.UploadDir != "" {
		uploadDir = cfg.UploadDir
	}
	tempDir := filepath.Join(uploadDir, "temp")
	proofsDir := filepath.Join(uploadDir, "proofs")

	tempChunkPath := filepath.Join(tempDir, fmt.Sprintf("%s_%d.part", uploadID, chunkIndex))
	out, err := os.Create(tempChunkPath)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Ошибка создания временного файла чанка"})
	}

	if _, err := io.Copy(out, file); err != nil {
		out.Close()
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Ошибка записи чанка"})
	}
	out.Close()

	if chunkIndex == totalChunks-1 {
		mergeLock.Lock()
		defer mergeLock.Unlock()

		ext := filepath.Ext(fileName)
		baseName := filepath.Base(fileName)
		if len(ext) > 0 && len(baseName) > len(ext) {
			baseName = baseName[:len(baseName)-len(ext)]
		}
		finalFileName := fmt.Sprintf("%d_%s%s", time.Now().Unix(), baseName, ext)
		finalPath := filepath.Join(proofsDir, finalFileName)

		finalFile, err := os.Create(finalPath)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Ошибка создания итогового файла"})
		}
		defer finalFile.Close()

		for i := 0; i < totalChunks; i++ {
			partPath := filepath.Join(tempDir, fmt.Sprintf("%s_%d.part", uploadID, i))
			partFile, err := os.Open(partPath)
			if err != nil {
				log.Printf("[Uploads] Ошибка чтения чанка %d: %v", i, err)
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Ошибка сборки файла"})
			}
			_, copyErr := io.Copy(finalFile, partFile)
			partFile.Close()
			_ = os.Remove(partPath)
			if copyErr != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Ошибка записи собранного файла"})
			}
		}

		publicURL := "/uploads/proofs/" + finalFileName
		return c.JSON(fiber.Map{
			"success":   true,
			"completed": true,
			"file_path": publicURL,
		})
	}

	return c.JSON(fiber.Map{
		"success":   true,
		"completed": false,
		"progress":  fmt.Sprintf("%d/%d", chunkIndex+1, totalChunks),
	})
}
