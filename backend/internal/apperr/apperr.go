// Package apperr — ошибки, которые безопасно показывать клиенту.
package apperr

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
)

type Error struct {
	Status  int
	Code    string
	Message string
}

func (e *Error) Error() string { return e.Code + ": " + e.Message }

func New(status int, code, format string, args ...any) *Error {
	return &Error{Status: status, Code: code, Message: fmt.Sprintf(format, args...)}
}

func NotFound(what string) *Error {
	return New(http.StatusNotFound, "not_found", "Не нашли: %s", strings.ToLower(what))
}

func Forbidden() *Error {
	return New(http.StatusForbidden, "forbidden", "Нет доступа")
}

func Unauthorized(msg string) *Error {
	return New(http.StatusUnauthorized, "unauthorized", "%s", msg)
}

func Validation(format string, args ...any) *Error {
	return New(http.StatusUnprocessableEntity, "validation", format, args...)
}

func Conflict(code, format string, args ...any) *Error {
	return New(http.StatusConflict, code, format, args...)
}

// As достаёт *Error из цепочки ошибок.
func As(err error) (*Error, bool) {
	var e *Error
	ok := errors.As(err, &e)
	return e, ok
}
