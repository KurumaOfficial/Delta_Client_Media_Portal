package handlers

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
)

var uploadLock sync.Mutex

func InitUploadDirs() {
	_ = os.MkdirAll("./uploads/temp", 0755)
	_ = os.MkdirAll("./uploads/proofs", 0755)
}

// InitUpload initializes a chunked session for ultra-large files (up to 15GB+)
func InitUpload(c *fiber.Ctx) error {
	var body struct {
		FileName string `json:"file_name"`
		FileSize int64  `json:"file_size"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
	}

	uploadID := fmt.Sprintf("%d_%s", time.Now().UnixNano(), filepath.Base(body.FileName))
	chunkSize := int64(5 * 1024 * 1024) // 5MB per chunk

	totalChunks := (body.FileSize + chunkSize - 1) / chunkSize

	return c.JSON(fiber.Map{
		"success":      true,
		"upload_id":    uploadID,
		"chunk_size":   chunkSize,
		"total_chunks": totalChunks,
	})
}

// UploadChunk receives a single 5MB chunk and streams it to disk with zero RAM overhead
func UploadChunk(c *fiber.Ctx) error {
	uploadID := c.FormValue("upload_id")
	chunkIndexStr := c.FormValue("chunk_index")
	totalChunksStr := c.FormValue("total_chunks")
	fileName := c.FormValue("file_name")

	if uploadID == "" || chunkIndexStr == "" || totalChunksStr == "" {
		return c.Status(400).JSON(fiber.Map{"error": "missing chunk metadata"})
	}

	chunkIndex, err := strconv.Atoi(chunkIndexStr)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid chunk index"})
	}

	totalChunks, err := strconv.Atoi(totalChunksStr)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid total chunks"})
	}

	fileHeader, err := c.FormFile("chunk")
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "failed to get chunk file"})
	}

	file, err := fileHeader.Open()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to open chunk"})
	}
	defer file.Close()

	// Save chunk file into temp folder
	tempChunkPath := filepath.Join("./uploads/temp", fmt.Sprintf("%s_%d.part", uploadID, chunkIndex))
	out, err := os.Create(tempChunkPath)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to create temp chunk file"})
	}

	// Stream chunk directly to disk (RAM remains < 5MB!)
	_, err = io.Copy(out, file)
	out.Close()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to save chunk to disk"})
	}

	// If final chunk received, merge all chunks into final file
	if chunkIndex == totalChunks-1 {
		uploadLock.Lock()
		defer uploadLock.Unlock()

		ext := filepath.Ext(fileName)
		finalFileName := fmt.Sprintf("%d_%s%s", time.Now().Unix(), filepath.Base(fileName[:len(fileName)-len(ext)]), ext)
		finalPath := filepath.Join("./uploads/proofs", finalFileName)

		finalFile, err := os.Create(finalPath)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "failed to create final proof file"})
		}
		defer finalFile.Close()

		for i := 0; i < totalChunks; i++ {
			partPath := filepath.Join("./uploads/temp", fmt.Sprintf("%s_%d.part", uploadID, i))
			partFile, err := os.Open(partPath)
			if err != nil {
				log.Printf("Error opening chunk part %d: %v", i, err)
				return c.Status(500).JSON(fiber.Map{"error": "failed to assemble proof chunks"})
			}
			_, err = io.Copy(finalFile, partFile)
			partFile.Close()
			_ = os.Remove(partPath) // Cleanup part
			if err != nil {
				return c.Status(500).JSON(fiber.Map{"error": "failed writing chunk to final proof"})
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
