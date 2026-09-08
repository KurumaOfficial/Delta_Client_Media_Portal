package telegram

import (
	"bytes"
	"io"
	"mime/multipart"
)

// mpWriter — тонкая обёртка над mime/multipart для отправки файлов.
type mpWriter struct {
	w   *multipart.Writer
	buf *bytes.Buffer
}

func newMultipartWriter(buf *bytes.Buffer) *mpWriter {
	return &mpWriter{w: multipart.NewWriter(buf), buf: buf}
}

func (m *mpWriter) writeField(name, value string) error {
	return m.w.WriteField(name, value)
}

func (m *mpWriter) writeFile(field, filename string, content []byte) error {
	part, err := m.w.CreateFormFile(field, filename)
	if err != nil {
		return err
	}
	_, err = part.Write(content)
	return err
}

func (m *mpWriter) close() error { return m.w.Close() }

func (m *mpWriter) contentType() string { return m.w.FormDataContentType() }

var _ io.Writer = (*bytes.Buffer)(nil)
