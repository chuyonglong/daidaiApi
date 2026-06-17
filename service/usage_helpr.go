package service

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/gin-gonic/gin"
)

//func GetPromptTokens(textRequest dto.GeneralOpenAIRequest, relayMode int) (int, error) {
//	switch relayMode {
//	case constant.RelayModeChatCompletions:
//		return CountTokenMessages(textRequest.Messages, textRequest.Model)
//	case constant.RelayModeCompletions:
//		return CountTokenInput(textRequest.Prompt, textRequest.Model), nil
//	case constant.RelayModeModerations:
//		return CountTokenInput(textRequest.Input, textRequest.Model), nil
//	}
//	return 0, errors.New("unknown relay mode")
//}

func ResponseText2Usage(c *gin.Context, responseText string, modeName string, promptTokens int) *dto.Usage {
	common.SetContextKey(c, constant.ContextKeyLocalCountTokens, true)
	usage := &dto.Usage{}
	usage.PromptTokens = promptTokens
	usage.CompletionTokens = EstimateTokenByModel(modeName, responseText)
	usage.TotalTokens = usage.PromptTokens + usage.CompletionTokens
	return usage
}

func ValidUsage(usage *dto.Usage) bool {
	return usage != nil && (usage.PromptTokens != 0 || usage.CompletionTokens != 0)
}

func extractQuotaDataTokens(usage *dto.Usage) (promptTokenUsed int, cacheTokenUsed int) {
	if usage == nil {
		return 0, 0
	}
	promptTokenUsed = usage.InputTokens
	if promptTokenUsed <= 0 {
		promptTokenUsed = usage.PromptTokens
	}
	isAnthropicSemantic := usage.UsageSource == "anthropic" ||
		usage.UsageSemantic == "anthropic" ||
		usage.ClaudeCacheCreation5mTokens > 0 ||
		usage.ClaudeCacheCreation1hTokens > 0
	if usage.InputTokens <= 0 && isAnthropicSemantic {
		cacheCreationTokens := usage.PromptTokensDetails.CachedCreationTokens
		splitCacheCreationTokens := usage.ClaudeCacheCreation5mTokens + usage.ClaudeCacheCreation1hTokens
		if splitCacheCreationTokens > cacheCreationTokens {
			cacheCreationTokens = splitCacheCreationTokens
		}
		promptTokenUsed = usage.PromptTokens + usage.PromptTokensDetails.CachedTokens + cacheCreationTokens
	}
	cacheTokenUsed = usage.PromptTokensDetails.CachedTokens
	if cacheTokenUsed == 0 && usage.InputTokensDetails != nil {
		cacheTokenUsed = usage.InputTokensDetails.CachedTokens
	}
	return promptTokenUsed, cacheTokenUsed
}

func extractRealtimeQuotaDataTokens(usage *dto.RealtimeUsage) (promptTokenUsed int, cacheTokenUsed int) {
	if usage == nil {
		return 0, 0
	}
	promptTokenUsed = usage.InputTokens
	cacheTokenUsed = usage.InputTokenDetails.CachedTokens
	return promptTokenUsed, cacheTokenUsed
}
