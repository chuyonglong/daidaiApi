package service

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/types"
)

func formatNotifyType(channelId int, status int) string {
	return fmt.Sprintf("%s_%d_%d", dto.NotifyTypeChannelUpdate, channelId, status)
}

// disable & notify
func DisableChannel(channelError types.ChannelError, reason string) {
	common.SysLog(fmt.Sprintf("通道「%s」（#%d）发生错误，准备禁用，原因：%s", channelError.ChannelName, channelError.ChannelId, reason))

	// 检查是否启用自动禁用功能
	if !channelError.AutoBan {
		common.SysLog(fmt.Sprintf("通道「%s」（#%d）未启用自动禁用功能，跳过禁用操作", channelError.ChannelName, channelError.ChannelId))
		return
	}

	success := model.UpdateChannelStatus(channelError.ChannelId, channelError.UsingKey, common.ChannelStatusAutoDisabled, reason)
	if success {
		if channel, err := model.CacheGetChannel(channelError.ChannelId); err == nil && channel != nil && channel.Status != common.ChannelStatusEnabled {
			deleted := ClearChannelAffinityCacheByChannelID(channelError.ChannelId)
			if deleted > 0 {
				common.SysLog(fmt.Sprintf("cleared %d channel affinity cache entries for disabled channel #%d", deleted, channelError.ChannelId))
			}
		}
		subject := fmt.Sprintf("Channel %s (#%d) disabled", channelError.ChannelName, channelError.ChannelId)
		content := fmt.Sprintf("Channel %s (#%d) disabled, reason: %s", channelError.ChannelName, channelError.ChannelId, reason)
		NotifyRootUser(formatNotifyType(channelError.ChannelId, common.ChannelStatusAutoDisabled), subject, content)
	}
}

func DisableChannelWithError(channelError types.ChannelError, err *types.NewAPIError) {
	reason := ""
	if err != nil {
		reason = err.ErrorWithStatusCode()
	}
	common.SysLog(fmt.Sprintf("channel %s (#%d) error, preparing to disable, reason: %s", channelError.ChannelName, channelError.ChannelId, reason))

	if !channelError.AutoBan {
		common.SysLog(fmt.Sprintf("channel %s (#%d) auto-ban disabled, skip disable", channelError.ChannelName, channelError.ChannelId))
		return
	}

	var summaryPtr *model.MultiKeyErrorSummary
	if channelError.IsMultiKey {
		if summary, ok := BuildMultiKeyErrorSummary(err); ok {
			summaryPtr = &summary
		} else {
			return
		}
	}

	success := model.UpdateChannelStatusWithErrorSummary(channelError.ChannelId, channelError.UsingKey, common.ChannelStatusAutoDisabled, reason, summaryPtr)
	if success {
		if channel, err := model.CacheGetChannel(channelError.ChannelId); err == nil && channel != nil && channel.Status != common.ChannelStatusEnabled {
			deleted := ClearChannelAffinityCacheByChannelID(channelError.ChannelId)
			if deleted > 0 {
				common.SysLog(fmt.Sprintf("cleared %d channel affinity cache entries for disabled channel #%d", deleted, channelError.ChannelId))
			}
		}
		subject := fmt.Sprintf("通道「%s」（#%d）已被禁用", channelError.ChannelName, channelError.ChannelId)
		content := fmt.Sprintf("通道「%s」（#%d）已被禁用，原因：%s", channelError.ChannelName, channelError.ChannelId, reason)
		NotifyRootUser(formatNotifyType(channelError.ChannelId, common.ChannelStatusAutoDisabled), subject, content)
	}
}

func BuildMultiKeyErrorSummary(err *types.NewAPIError) (model.MultiKeyErrorSummary, bool) {
	if err == nil || isNetworkChannelError(err) {
		return model.MultiKeyErrorSummary{}, false
	}

	code := string(err.GetErrorCode())
	lowerCode := strings.ToLower(code)
	lowerMessage := strings.ToLower(err.Error())
	reason := ""

	switch {
	case err.StatusCode == http.StatusUnauthorized,
		strings.Contains(lowerCode, "key"),
		strings.Contains(lowerCode, "token"),
		strings.Contains(lowerCode, "auth"),
		strings.Contains(lowerMessage, "api key"):
		reason = "认证失败"
	case err.StatusCode == http.StatusForbidden,
		strings.Contains(lowerCode, "permission"),
		strings.Contains(lowerCode, "forbidden"),
		strings.Contains(lowerMessage, "permission denied"):
		reason = "权限不足"
	case strings.Contains(lowerCode, "quota"),
		strings.Contains(lowerCode, "credit"),
		strings.Contains(lowerCode, "balance"),
		strings.Contains(lowerMessage, "quota"),
		strings.Contains(lowerMessage, "credit balance"):
		reason = "额度不足"
	case err.StatusCode == http.StatusTooManyRequests,
		strings.Contains(lowerCode, "rate_limit"):
		reason = "限速"
	case strings.Contains(lowerCode, "model"),
		strings.Contains(lowerMessage, "model"):
		reason = "模型无效"
	case strings.Contains(lowerMessage, "organization has been disabled"),
		strings.Contains(lowerMessage, "account"):
		reason = "账号无效"
	case types.IsChannelError(err), operation_setting.ShouldDisableByStatusCode(err.StatusCode):
		reason = "请求失败"
	default:
		search, _ := AcSearch(lowerMessage, operation_setting.AutomaticDisableKeywords, true)
		if !search {
			return model.MultiKeyErrorSummary{}, false
		}
		reason = "请求失败"
	}

	return model.MultiKeyErrorSummary{
		Status: err.StatusCode,
		Code:   code,
		Reason: trimReasonRunes(reason, 10),
	}, true
}

func isNetworkChannelError(err *types.NewAPIError) bool {
	if err == nil {
		return false
	}
	if err.GetErrorCode() == types.ErrorCodeDoRequestFailed {
		return true
	}
	msg := strings.ToLower(err.Error())
	networkMarkers := []string{
		"timeout",
		"i/o timeout",
		"connection reset",
		"connection refused",
		"no such host",
		"dns",
		"tls",
		"temporary failure",
		"network is unreachable",
	}
	for _, marker := range networkMarkers {
		if strings.Contains(msg, marker) {
			return true
		}
	}
	return false
}

func trimReasonRunes(s string, max int) string {
	runes := []rune(s)
	if len(runes) <= max {
		return s
	}
	return string(runes[:max])
}

func EnableChannel(channelId int, usingKey string, channelName string) {
	success := model.UpdateChannelStatus(channelId, usingKey, common.ChannelStatusEnabled, "")
	if success {
		subject := fmt.Sprintf("通道「%s」（#%d）已被启用", channelName, channelId)
		content := fmt.Sprintf("通道「%s」（#%d）已被启用", channelName, channelId)
		NotifyRootUser(formatNotifyType(channelId, common.ChannelStatusEnabled), subject, content)
	}
}

func ShouldDisableChannel(err *types.NewAPIError) bool {
	if !common.AutomaticDisableChannelEnabled {
		return false
	}
	if err == nil {
		return false
	}
	if types.IsChannelError(err) {
		return true
	}
	if types.IsSkipRetryError(err) {
		return false
	}
	if isNetworkChannelError(err) {
		return false
	}
	if operation_setting.ShouldDisableByStatusCode(err.StatusCode) {
		return true
	}

	lowerMessage := strings.ToLower(err.Error())
	search, _ := AcSearch(lowerMessage, operation_setting.AutomaticDisableKeywords, true)
	return search
}

func ShouldEnableChannel(newAPIError *types.NewAPIError, status int) bool {
	if !common.AutomaticEnableChannelEnabled {
		return false
	}
	if newAPIError != nil {
		return false
	}
	if status != common.ChannelStatusAutoDisabled {
		return false
	}
	return true
}
