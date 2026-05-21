package operation_setting

import "strings"

var DemoSiteEnabled = false
var SelfUseModeEnabled = false

var AutomaticDisableKeywords = []string{
	"Your credit balance is too low",
	"This organization has been disabled.",
	"You exceeded your current quota",
	"Permission denied",
	"The security token included in the request is invalid",
	"Operation not allowed",
	"Your account is not authorized",
}

var AutomaticRetryErrorKeywords []string

func AutomaticDisableKeywordsToString() string {
	return strings.Join(AutomaticDisableKeywords, "\n")
}

func AutomaticDisableKeywordsFromString(s string) {
	AutomaticDisableKeywords = []string{}
	ak := strings.Split(s, "\n")
	for _, k := range ak {
		k = strings.TrimSpace(k)
		k = strings.ToLower(k)
		if k != "" {
			AutomaticDisableKeywords = append(AutomaticDisableKeywords, k)
		}
	}
}

func AutomaticRetryErrorKeywordsToString() string {
	return strings.Join(AutomaticRetryErrorKeywords, "\n")
}

func AutomaticRetryErrorKeywordsFromString(s string) {
	AutomaticRetryErrorKeywords = parseRetryErrorKeywords(s)
}

func HasAutomaticRetryErrorKeywords() bool {
	return len(AutomaticRetryErrorKeywords) > 0
}

func ShouldRetryByErrorKeyword(message string) bool {
	if message == "" || len(AutomaticRetryErrorKeywords) == 0 {
		return false
	}
	lowerMessage := strings.ToLower(message)
	for _, keyword := range AutomaticRetryErrorKeywords {
		if keyword == "" {
			continue
		}
		if strings.Contains(lowerMessage, keyword) {
			return true
		}
	}
	return false
}

func parseRetryErrorKeywords(s string) []string {
	s = strings.NewReplacer("\r\n", "\n", "\r", "\n").Replace(s)
	parts := strings.FieldsFunc(s, func(r rune) bool {
		return r == '\n' || r == ','
	})

	seen := make(map[string]struct{}, len(parts))
	keywords := make([]string, 0, len(parts))
	for _, part := range parts {
		keyword := strings.TrimSpace(part)
		keyword = strings.ToLower(keyword)
		if keyword == "" {
			continue
		}
		if _, ok := seen[keyword]; ok {
			continue
		}
		seen[keyword] = struct{}{}
		keywords = append(keywords, keyword)
	}
	return keywords
}
