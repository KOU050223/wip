package domain

import "time"

type Score struct {
	ID         uint      `json:"id" gorm:"primaryKey"`
	PlayerName string    `json:"player_name" gorm:"size:64;not null"`
	Score      int       `json:"score" gorm:"not null"`
	MaxCombo   int       `json:"max_combo" gorm:"not null"`
	ClearTime  int       `json:"clear_time" gorm:"not null"`
	CreatedAt  time.Time `json:"created_at"`
}
