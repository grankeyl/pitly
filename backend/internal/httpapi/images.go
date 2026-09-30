package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"pitly/internal/store"
)

const (
	maxImageBytes       = 3 << 20 // 3 МБ: клиент сжимает картинку перед отправкой
	maxUploadsPerHour   = 30
	imageCacheControl   = "public, max-age=31536000, immutable"
	imageUploadErrLarge = "Картинка больше 3 МБ"
)

var allowedImageTypes = map[string]bool{"image/jpeg": true, "image/png": true, "image/webp": true}

func writeJSONError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"code": code, "message": message})
}

// UploadImage принимает картинку телом запроса (POST /api/images) и возвращает её id и адрес.
// Тип определяется по содержимому, а не по заголовку: заголовку клиента доверять нельзя.
func (s *Server) UploadImage(w http.ResponseWriter, r *http.Request) {
	uid := userID(r.Context())
	if uid == 0 {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized", "Нужна авторизация")
		return
	}
	recent, err := s.Queries.CountImagesByOwnerSince(r.Context(), store.CountImagesByOwnerSinceParams{OwnerID: uid, CreatedAt: time.Now().Add(-time.Hour)})
	if err != nil {
		s.Log.Error("count images", "err", err)
		writeJSONError(w, http.StatusInternalServerError, "internal", "Не получилось загрузить картинку")
		return
	}
	if recent >= maxUploadsPerHour {
		writeJSONError(w, http.StatusTooManyRequests, "too_many_uploads", "Слишком много загрузок, попробуйте через час")
		return
	}

	data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxImageBytes))
	if err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			writeJSONError(w, http.StatusRequestEntityTooLarge, "image_too_large", imageUploadErrLarge)
			return
		}
		writeJSONError(w, http.StatusBadRequest, "bad_request", "Не получилось прочитать картинку")
		return
	}
	contentType := http.DetectContentType(data)
	if !allowedImageTypes[contentType] {
		writeJSONError(w, http.StatusUnsupportedMediaType, "unsupported_image", "Подойдёт JPEG, PNG или WebP")
		return
	}

	id, err := s.Queries.CreateImage(r.Context(), store.CreateImageParams{OwnerID: uid, ContentType: contentType, Data: data})
	if err != nil {
		s.Log.Error("create image", "err", err)
		writeJSONError(w, http.StatusInternalServerError, "internal", "Не получилось сохранить картинку")
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]string{"id": id.String(), "url": imageURL(id)})
}

// ServeImage отдаёт картинку по id (GET /img/{id}). Адрес публичный: его открывает <img> без заголовков,
// а угадать случайный UUID нельзя.
func (s *Server) ServeImage(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.NotFound(w, r)
		return
	}
	img, err := s.Queries.GetImage(r.Context(), id)
	if errors.Is(err, pgx.ErrNoRows) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		s.Log.Error("get image", "err", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", img.ContentType)
	w.Header().Set("Cache-Control", imageCacheControl)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	_, _ = w.Write(img.Data)
}

func imageURL(id uuid.UUID) string { return "/img/" + id.String() }
