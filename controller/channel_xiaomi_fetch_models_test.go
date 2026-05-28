package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestFetchModelsReturnsXiaomiStaticModels(t *testing.T) {
	gin.SetMode(gin.TestMode)

	body := `{"type":58,"base_url":"","key":""}`
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/channel/fetch_models", strings.NewReader(body))
	ctx.Request.Header.Set("Content-Type", "application/json")

	FetchModels(ctx)

	require.Equal(t, http.StatusOK, recorder.Code)
	var payload struct {
		Success bool     `json:"success"`
		Data    []string `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &payload))
	require.True(t, payload.Success)
	require.Equal(t, []string{"MiMo-VL-7B-RL", "MiMo-7B-RL"}, payload.Data)
	require.Equal(t, "https://api.xiaomimimo.com", constant.ChannelBaseURLs[constant.ChannelTypeXiaomi])
}
