package service

import (
	"net/http"
	"testing"
	"time"
)

func TestNewRelayHTTPTransportUsesStaleConnectionGuards(t *testing.T) {
	transport := newRelayHTTPTransport(http.ProxyFromEnvironment)

	if transport.IdleConnTimeout != 90*time.Second {
		t.Fatalf("IdleConnTimeout = %s, want %s", transport.IdleConnTimeout, 90*time.Second)
	}
	if transport.TLSHandshakeTimeout != 10*time.Second {
		t.Fatalf("TLSHandshakeTimeout = %s, want %s", transport.TLSHandshakeTimeout, 10*time.Second)
	}
	if transport.ExpectContinueTimeout != time.Second {
		t.Fatalf("ExpectContinueTimeout = %s, want %s", transport.ExpectContinueTimeout, time.Second)
	}
	if !transport.ForceAttemptHTTP2 {
		t.Fatal("ForceAttemptHTTP2 = false, want true")
	}
}
