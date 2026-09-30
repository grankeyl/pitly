// Package money — расчёт комиссии и форматирование сумм.
// Все суммы — int64 в минимальных единицах (копейках). float не используется нигде.
package money

import (
	"strconv"
	"strings"
)

// Split делит платёж на комиссию платформы и сумму автору.
// Комиссия округляется вниз до копейки — копейка округления остаётся автору.
func Split(amount int64, commissionBps int) (fee, net int64) {
	fee = amount * int64(commissionBps) / 10000
	return fee, amount - fee
}

// Format: 123456 RUB -> "1 234,56 ₽", 100000 -> "1 000 ₽".
func Format(amount int64, currency string) string {
	neg := amount < 0
	if neg {
		amount = -amount
	}
	units, cents := amount/100, amount%100

	digits := strconv.FormatInt(units, 10)
	var b strings.Builder
	if neg {
		b.WriteByte('-')
	}
	for i, r := range digits {
		if i > 0 && (len(digits)-i)%3 == 0 {
			b.WriteRune(' ')
		}
		b.WriteRune(r)
	}
	if cents != 0 {
		b.WriteByte(',')
		if cents < 10 {
			b.WriteByte('0')
		}
		b.WriteString(strconv.FormatInt(cents, 10))
	}
	b.WriteRune(' ')
	b.WriteString(Symbol(currency))
	return b.String()
}

func Symbol(currency string) string {
	switch currency {
	case "RUB":
		return "₽"
	case "EUR":
		return "€"
	case "USD":
		return "$"
	default:
		return currency
	}
}
