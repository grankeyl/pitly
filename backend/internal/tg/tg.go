// Package tg — минимальный интерфейс к Telegram, который нужен бизнес-логике.
// Реальная реализация — в пакете bot; Noop — когда BOT_TOKEN не задан.
package tg

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/url"
)

type Button struct {
	Text string
	URL  string
}

type Client interface {
	Username() string
	SendMessage(ctx context.Context, chatID int64, text string, buttons ...Button) error
	// CreateJoinRequestLink создаёт ссылку-заявку: вступление только после одобрения ботом.
	CreateJoinRequestLink(ctx context.Context, chatID int64, name string) (string, error)
	ApproveJoinRequest(ctx context.Context, chatID, userID int64) error
	DeclineJoinRequest(ctx context.Context, chatID, userID int64) error
	// Kick удаляет участника, не оставляя его в бане — после новой оплаты он сможет вернуться.
	Kick(ctx context.Context, chatID, userID int64) error
	// BotState проверяет бота в канале прямо сейчас: "" — всё в порядке, "removed" — бота нет или он не админ,
	// "no_rights" — админ без прав приглашать или блокировать.
	BotState(ctx context.Context, chatID int64) (string, error)
	// LeaveChat — бот выходит из канала, когда автор удаляет канал из Pitly.
	LeaveChat(ctx context.Context, chatID int64) error
	// PrepareShare готовит пост, который пользователь mini app сам отправит в любой чат.
	// Возвращает идентификатор подготовленного сообщения для WebApp.shareMessage.
	PrepareShare(ctx context.Context, userID int64, post Post) (string, error)
	// UploadPhoto загружает картинку на серверы Telegram и возвращает её file_id.
	// Для этого бот тихо отправляет фото в личный чат и сразу удаляет сообщение.
	UploadPhoto(ctx context.Context, chatID int64, data []byte) (string, error)
}

// Post — пост подписки: текст в HTML, необязательная картинка и кнопка-ссылка под ним.
type Post struct {
	Title string
	HTML  string
	// ImageFileID — картинка, уже загруженная в Telegram. Если он задан, ImageURL не используется.
	ImageFileID string
	ImageURL    string
	// Размеры картинки в пикселях. Без них Telegram показывает её обрезанной миниатюрой.
	ImageWidth, ImageHeight int
	ButtonText              string
	ButtonURL               string
}

var ErrDisabled = errors.New("telegram bot is disabled (BOT_TOKEN is empty)")

// ErrPermanent — Telegram отказал так, что повтор не поможет
// (канал удалён, бота лишили прав, пользователь заблокировал бота).
var ErrPermanent = errors.New("permanent telegram error")

// Noop логирует вызовы вместо обращения к Telegram.
type Noop struct{ Log *slog.Logger }

func (n Noop) Username() string                                           { return "pitly_dev_bot" }
func (n Noop) BotState(context.Context, int64) (string, error)            { return "", nil }
func (n Noop) LeaveChat(context.Context, int64) error                     { return nil }
func (n Noop) UploadPhoto(context.Context, int64, []byte) (string, error) { return "", ErrDisabled }
func (n Noop) PrepareShare(context.Context, int64, Post) (string, error) {
	return "", ErrDisabled
}
func (n Noop) SendMessage(_ context.Context, chatID int64, text string, _ ...Button) error {
	n.Log.Info("tg noop: send message", "chat_id", chatID, "text", text)
	return nil
}
func (n Noop) CreateJoinRequestLink(_ context.Context, chatID int64, _ string) (string, error) {
	return fmt.Sprintf("https://t.me/+noop%d", chatID), nil
}
func (n Noop) ApproveJoinRequest(context.Context, int64, int64) error { return nil }
func (n Noop) DeclineJoinRequest(context.Context, int64, int64) error { return nil }
func (n Noop) Kick(_ context.Context, chatID, userID int64) error {
	n.Log.Info("tg noop: kick", "chat_id", chatID, "user_id", userID)
	return nil
}

// Links строит ссылки на mini app.
type Links struct {
	BotUsername string
	// Короткое имя mini app из BotFather. Пусто — main mini app бота.
	ShortName string
	// ViaChat — у бота не включено основное приложение, поэтому ссылки t.me/<бот>?startapp=… не открываются.
	// Тогда ссылка ведёт в чат с ботом (?start=…), а бот отвечает кнопкой, которая открывает приложение.
	ViaChat bool
}

// MiniApp: ссылка, открывающая mini app с параметром запуска.
func (l Links) MiniApp(startParam string) string {
	base := "https://t.me/" + l.BotUsername
	if l.ViaChat && l.ShortName == "" {
		if startParam == "" {
			return base
		}
		return base + "?start=" + url.QueryEscape(startParam)
	}
	if l.ShortName != "" {
		base += "/" + l.ShortName
	}
	if startParam == "" {
		if l.ShortName == "" {
			return base + "?startapp"
		}
		return base
	}
	return base + "?startapp=" + url.QueryEscape(startParam)
}

// Offer — страница оплаты канала.
func (l Links) Offer(channelID int64) string { return l.MiniApp(fmt.Sprintf("c%d", channelID)) }

// Product — страница оплаты конкретной подписки.
func (l Links) Product(productID int64) string { return l.MiniApp(fmt.Sprintf("s%d", productID)) }

// Payment — возврат в mini app после оплаты.
func (l Links) Payment(paymentID string) string { return l.MiniApp("p" + paymentID) }

// ConnectChannel — диалог Telegram «добавить бота админом в канал» с нужными правами.
func (l Links) ConnectChannel() string {
	return "https://t.me/" + l.BotUsername + "?startchannel&admin=invite_users+restrict_members"
}
