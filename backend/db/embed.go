// Package db встраивает SQL-миграции в бинарник.
package db

import "embed"

//go:embed migrations/*.sql
var Migrations embed.FS
