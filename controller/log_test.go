package controller

import (
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestParseLogChannelQuery(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name     string
		rawQuery string
		want     int
	}{
		{name: "channel", rawQuery: "channel=24", want: 24},
		{name: "prefixed channel", rawQuery: "channel=%2324", want: 24},
		{name: "channel id alias", rawQuery: "channel_id=24", want: 24},
		{name: "empty channel falls back to alias", rawQuery: "channel=&channel_id=24", want: 24},
		{name: "invalid channel", rawQuery: "channel=abc", want: 0},
		{name: "zero channel", rawQuery: "channel=0", want: 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
			req := httptest.NewRequest("GET", "/api/log?"+tt.rawQuery, nil)
			ctx.Request = req

			got := parseLogChannelQuery(ctx)
			if got != tt.want {
				t.Fatalf("parseLogChannelQuery() = %d, want %d", got, tt.want)
			}
		})
	}
}
