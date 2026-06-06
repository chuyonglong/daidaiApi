package controller

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const (
	channelKeyScriptMaxBytes   = 100 * 1024
	channelKeyScriptOutputMax  = 128 * 1024
	channelKeyScriptTimeoutSec = 20
)

var channelKeyPattern = regexp.MustCompile(`sk-[A-Za-z0-9_-]+`)

type channelKeyScriptRequest struct {
	Script string `json:"script"`
}

type channelKeyScriptBackfillRequest struct {
	Key string `json:"key"`
}

type channelKeyScriptExecuteResponse struct {
	Keys            []string `json:"keys"`
	MergedKey       string   `json:"merged_key"`
	Output          string   `json:"output"`
	IsOutputTrimmed bool     `json:"is_output_trimmed"`
	IsMultiKey      bool     `json:"is_multi_key"`
}

func parseChannelIdParam(c *gin.Context) (int, error) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return 0, fmt.Errorf("invalid channel id: %w", err)
	}
	return id, nil
}
func extractChannelKeyScriptKeys(output string) []string {
	matches := channelKeyPattern.FindAllString(output, -1)
	keys := make([]string, 0, len(matches))
	seen := make(map[string]struct{}, len(matches))
	for _, key := range matches {
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		keys = append(keys, key)
	}
	return keys
}

func splitNonEmptyKeyLines(keyText string) []string {
	return model.SplitMultiKeyLines(keyText)
}

func mergeChannelKeyScriptKeys(existing string, newKeys []string) string {
	merged := make([]string, 0, len(newKeys)+8)
	seen := make(map[string]struct{}, len(newKeys)+8)
	for _, key := range splitNonEmptyKeyLines(existing) {
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		merged = append(merged, key)
	}
	for _, key := range newKeys {
		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		merged = append(merged, key)
	}
	return model.FormatMultiKeyLines(merged)
}

func backfillChannelKeyScriptKeys(channelId int, keyText string) (*model.Channel, error) {
	channel, err := model.GetChannelById(channelId, true)
	if err != nil {
		return nil, err
	}
	if channel == nil {
		return nil, errors.New("channel not found")
	}
	if !channel.ChannelInfo.IsMultiKey {
		return nil, errors.New("backfill save is only supported for multi-key channels")
	}

	oldKeys := channel.GetKeys()
	keys := splitNonEmptyKeyLines(keyText)
	if len(keys) == 0 {
		return nil, errors.New("key cannot be empty")
	}
	channel.Key = model.FormatMultiKeyLines(keys)
	channel.ChannelInfo.RemapMultiKeyState(oldKeys, keys)
	if channel.ChannelInfo.MultiKeyPollingIndex >= len(keys) {
		channel.ChannelInfo.MultiKeyPollingIndex = 0
	}
	if err := channel.Update(); err != nil {
		return nil, err
	}
	model.InitChannelCache()
	service.ResetProxyClientCache()
	return channel, nil
}

func truncateChannelKeyScriptOutput(output string) (string, bool) {
	if len(output) <= channelKeyScriptOutputMax {
		return output, false
	}
	return output[:channelKeyScriptOutputMax], true
}

func buildChannelKeyPythonEnv(baseEnv []string) []string {
	env := make([]string, 0, len(baseEnv)+2)
	for _, item := range baseEnv {
		name, _, found := strings.Cut(item, "=")
		if found {
			upperName := strings.ToUpper(name)
			if upperName == "PYTHONIOENCODING" || upperName == "PYTHONUTF8" {
				continue
			}
		}
		env = append(env, item)
	}
	return append(env, "PYTHONIOENCODING=utf-8", "PYTHONUTF8=1")
}

func runChannelKeyPythonScript(ctx context.Context, script string) (string, bool, error) {
	if strings.TrimSpace(script) == "" {
		return "", false, errors.New("script cannot be empty")
	}
	if len([]byte(script)) > channelKeyScriptMaxBytes {
		return "", false, fmt.Errorf("script exceeds %d bytes", channelKeyScriptMaxBytes)
	}

	tmp, err := os.CreateTemp("", "channel-key-script-*.py")
	if err != nil {
		return "", false, err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	if _, err := tmp.WriteString(script); err != nil {
		_ = tmp.Close()
		return "", false, err
	}
	if err := tmp.Close(); err != nil {
		return "", false, err
	}

	python := strings.TrimSpace(os.Getenv("CHANNEL_KEY_SCRIPT_PYTHON"))
	if python == "" {
		python = "python"
	}
	cmd := exec.CommandContext(ctx, python, tmpName)
	cmd.Env = buildChannelKeyPythonEnv(os.Environ())
	var output bytes.Buffer
	cmd.Stdout = &output
	cmd.Stderr = &output
	err = cmd.Run()
	trimmed, isTrimmed := truncateChannelKeyScriptOutput(output.String())
	if ctx.Err() == context.DeadlineExceeded {
		return trimmed, isTrimmed, errors.New("script execution timed out")
	}
	if err != nil {
		return trimmed, isTrimmed, err
	}
	return trimmed, isTrimmed, nil
}

func getOrCreateChannelKeyScript(channelId int) (*model.ChannelKeyScript, error) {
	var item model.ChannelKeyScript
	err := model.DB.Where("channel_id = ?", channelId).First(&item).Error
	if err == nil {
		return &item, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	now := common.GetTimestamp()
	item = model.ChannelKeyScript{ChannelId: channelId, CreatedTime: now, UpdatedTime: now}
	return &item, nil
}

func ensureChannelExists(channelId int) error {
	channel, err := model.GetChannelById(channelId, false)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errors.New("channel not found")
		}
		return err
	}
	if channel == nil || channel.Id == 0 {
		return errors.New("channel not found")
	}
	return nil
}

func GetChannelKeyScript(c *gin.Context) {
	channelId, err := parseChannelIdParam(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := ensureChannelExists(channelId); err != nil {
		common.ApiError(c, err)
		return
	}
	item, err := getOrCreateChannelKeyScript(channelId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, item)
}

func SaveChannelKeyScript(c *gin.Context) {
	channelId, err := parseChannelIdParam(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	var req channelKeyScriptRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiError(c, err)
		return
	}
	if len([]byte(req.Script)) > channelKeyScriptMaxBytes {
		c.JSON(200, gin.H{"success": false, "message": fmt.Sprintf("script exceeds %d bytes", channelKeyScriptMaxBytes)})
		return
	}
	if err := ensureChannelExists(channelId); err != nil {
		common.ApiError(c, err)
		return
	}
	item, err := getOrCreateChannelKeyScript(channelId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	now := common.GetTimestamp()
	item.Script = req.Script
	item.UpdatedTime = now
	if item.CreatedTime == 0 {
		item.CreatedTime = now
	}
	if err := model.DB.Save(item).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, item)
}

func ExecuteChannelKeyScript(c *gin.Context) {
	channelId, err := parseChannelIdParam(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	var req channelKeyScriptRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := ensureChannelExists(channelId); err != nil {
		common.ApiError(c, err)
		return
	}
	item, err := getOrCreateChannelKeyScript(channelId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	script := req.Script
	if script == "" {
		script = item.Script
	}
	channel, err := model.GetChannelById(channelId, true)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), time.Duration(channelKeyScriptTimeoutSec)*time.Second)
	defer cancel()
	output, isTrimmed, runErr := runChannelKeyPythonScript(ctx, script)
	keys := extractChannelKeyScriptKeys(output)
	merged := mergeChannelKeyScriptKeys(channel.Key, keys)
	now := common.GetTimestamp()
	item.Script = script
	item.LastOutput = output
	item.LastKeys = strings.Join(keys, "\n")
	item.UpdatedTime = now
	if item.CreatedTime == 0 {
		item.CreatedTime = now
	}
	if runErr != nil {
		item.LastStatus = "error"
		item.LastMessage = runErr.Error()
		_ = model.DB.Save(item).Error
		c.JSON(200, gin.H{"success": false, "message": runErr.Error(), "data": channelKeyScriptExecuteResponse{Keys: keys, MergedKey: merged, Output: output, IsOutputTrimmed: isTrimmed, IsMultiKey: channel.ChannelInfo.IsMultiKey}})
		return
	}
	if len(keys) == 0 {
		item.LastStatus = "empty"
		item.LastMessage = "no sk-* key found in script output"
		_ = model.DB.Save(item).Error
		c.JSON(200, gin.H{"success": false, "message": item.LastMessage, "data": channelKeyScriptExecuteResponse{Keys: keys, MergedKey: merged, Output: output, IsOutputTrimmed: isTrimmed, IsMultiKey: channel.ChannelInfo.IsMultiKey}})
		return
	}
	item.LastStatus = "success"
	item.LastMessage = ""
	if err := model.DB.Save(item).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, channelKeyScriptExecuteResponse{Keys: keys, MergedKey: merged, Output: output, IsOutputTrimmed: isTrimmed, IsMultiKey: channel.ChannelInfo.IsMultiKey})
}

func BackfillChannelKeyScript(c *gin.Context) {
	channelId, err := parseChannelIdParam(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	var req channelKeyScriptBackfillRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiError(c, err)
		return
	}
	channel, err := backfillChannelKeyScriptKeys(channelId, req.Key)
	if err != nil {
		c.JSON(200, gin.H{"success": false, "message": err.Error()})
		return
	}
	channel.Key = ""
	clearChannelInfo(channel)
	common.ApiSuccess(c, channel)
}
