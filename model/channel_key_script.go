package model

type ChannelKeyScript struct {
	Id          int    `json:"id" gorm:"primaryKey"`
	ChannelId   int    `json:"channel_id" gorm:"uniqueIndex;not null"`
	Script      string `json:"script" gorm:"type:text;not null"`
	LastStatus  string `json:"last_status" gorm:"type:varchar(32);default:''"`
	LastMessage string `json:"last_message" gorm:"type:text"`
	LastOutput  string `json:"last_output" gorm:"type:text"`
	LastKeys    string `json:"last_keys" gorm:"type:text"`
	CreatedTime int64  `json:"created_time" gorm:"bigint"`
	UpdatedTime int64  `json:"updated_time" gorm:"bigint"`
}
