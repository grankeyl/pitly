package money

import "testing"

func TestSplit(t *testing.T) {
	cases := []struct {
		amount   int64
		bps      int
		fee, net int64
	}{
		{20000, 2000, 4000, 16000}, // 200 ₽ -> автору 160 ₽
		{100, 2000, 20, 80},
		{99, 2000, 19, 80}, // округление в пользу автора
		{15000, 0, 0, 15000},
		{15000, 10000, 15000, 0},
	}
	for _, c := range cases {
		fee, net := Split(c.amount, c.bps)
		if fee != c.fee || net != c.net {
			t.Errorf("Split(%d, %d) = %d, %d; want %d, %d", c.amount, c.bps, fee, net, c.fee, c.net)
		}
		if fee+net != c.amount {
			t.Errorf("Split(%d, %d): fee+net != amount", c.amount, c.bps)
		}
	}
}

func TestFormat(t *testing.T) {
	cases := map[int64]string{
		100000:  "1 000 ₽",
		123456:  "1 234,56 ₽",
		5:       "0,05 ₽",
		-20000:  "-200 ₽",
		1000000: "10 000 ₽",
	}
	for in, want := range cases {
		if got := Format(in, "RUB"); got != want {
			t.Errorf("Format(%d) = %q; want %q", in, got, want)
		}
	}
}
