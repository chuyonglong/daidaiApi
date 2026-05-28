package controller

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

type BatchCreateModelsRequest struct {
	VendorID   int      `json:"vendor_id"`
	ModelNames []string `json:"model_names"`
}

type BatchCreateModelsResponse struct {
	CreatedCount  int      `json:"created_count"`
	SkippedCount  int      `json:"skipped_count"`
	SkippedModels []string `json:"skipped_models"`
}

// BatchCreateModels creates missing model metadata records for one vendor.
func BatchCreateModels(c *gin.Context) {
	var req BatchCreateModelsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	if req.VendorID == 0 {
		common.ApiErrorMsg(c, "缺少供应商 ID")
		return
	}
	if _, err := model.GetVendorByID(req.VendorID); err != nil {
		common.ApiErrorMsg(c, "供应商不存在")
		return
	}

	response := BatchCreateModelsResponse{}
	seen := make(map[string]struct{}, len(req.ModelNames))
	for _, rawName := range req.ModelNames {
		name := strings.TrimSpace(rawName)
		if name == "" {
			response.SkippedModels = append(response.SkippedModels, name)
			continue
		}
		if _, ok := seen[name]; ok {
			response.SkippedModels = append(response.SkippedModels, name)
			continue
		}
		seen[name] = struct{}{}

		duplicated, err := model.IsModelNameDuplicated(0, name)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		if duplicated {
			response.SkippedModels = append(response.SkippedModels, name)
			continue
		}

		m := model.Model{
			ModelName:    name,
			VendorID:     req.VendorID,
			Status:       1,
			SyncOfficial: 1,
			NameRule:     model.NameRuleExact,
		}
		if err := m.Insert(); err != nil {
			common.ApiError(c, err)
			return
		}
		response.CreatedCount++
	}

	response.SkippedCount = len(response.SkippedModels)
	model.RefreshPricing()
	common.ApiSuccess(c, response)
}
