// Read-only market scanner. No account credentials or trading manager are loaded.
package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"guanlan/archive"
	"guanlan/signals"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"sync"
	"syscall"
	"time"
)

type state struct {
	sync.RWMutex
	Result        *signals.RadarResult `json:"result"`
	Scanning      bool                 `json:"scanning"`
	ArchiveError  string               `json:"archive_error,omitempty"`
	PaperError    string               `json:"paper_error,omitempty"`
	TrackingError string               `json:"tracking_error,omitempty"`
	Error         string               `json:"error,omitempty"`
	LastAttempt   time.Time            `json:"last_attempt"`
	NextScan      time.Time            `json:"next_scan"`
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	current := &state{}
	archivePath := os.Getenv("GUANLAN_ARCHIVE_DB")
	if archivePath == "" {
		archivePath = "signal-archive.db"
	}
	ledger, err := archive.Open(archivePath)
	if err != nil {
		log.Fatalf("open signal archive: %v", err)
	}
	defer ledger.Close()
	go func() {
		for {
			workCtx, cancel := context.WithTimeout(ctx, 50*time.Second)
			err := ledger.Resolve(workCtx, time.Now().UTC())
			cancel()
			current.Lock()
			current.TrackingError = ""
			if err != nil {
				current.TrackingError = err.Error()
				log.Printf("archive tracking: %v", err)
			}
			current.Unlock()
			select {
			case <-ctx.Done():
				return
			case <-time.After(time.Minute):
			}
		}
	}()
	go func() {
		for {
			workCtx, cancel := context.WithTimeout(ctx, 40*time.Second)
			err := ledger.ResolvePaper(workCtx, time.Now().UTC())
			cancel()
			current.Lock()
			current.PaperError = ""
			if err != nil {
				current.PaperError = err.Error()
				log.Printf("paper tracking: %v", err)
			}
			current.Unlock()
			select {
			case <-ctx.Done():
				return
			case <-time.After(time.Minute):
			}
		}
	}()
	go func() {
		for {
			if ctx.Err() != nil {
				return
			}
			current.Lock()
			current.Scanning = true
			current.LastAttempt = time.Now().UTC()
			current.Unlock()
			scanCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
			result, err := signals.Default.ScanRadar(scanCtx)
			cancel()
			current.Lock()
			current.Scanning = false
			current.Error = ""
			if err != nil {
				current.Error = err.Error()
				log.Printf("scan: %v", err)
			} else {
				current.ArchiveError = ""
				if captureErr := ledger.Capture(result, time.Now().UTC()); captureErr != nil {
					current.ArchiveError = captureErr.Error()
					log.Printf("archive capture: %v", captureErr)
				}
				current.Result = &result
				log.Printf("scanned=%d analyzed=%d", result.Scanned, result.Analyzed)
			}
			current.NextScan = time.Now().UTC().Add(2 * time.Minute)
			current.Unlock()
			timer := time.NewTimer(2 * time.Minute)
			select {
			case <-ctx.Done():
				timer.Stop()
				return
			case <-timer.C:
			}
		}
	}()
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/market/radar", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		current.RLock()
		defer current.RUnlock()
		json.NewEncoder(w).Encode(current)
	})
	mux.HandleFunc("GET /api/market/radar/archive", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		if page < 1 {
			page = 1
		}
		if page > 100000 {
			http.Error(w, "invalid page", 400)
			return
		}
		symbol := r.URL.Query().Get("symbol")
		if len(symbol) > 40 {
			http.Error(w, "invalid symbol", 400)
			return
		}
		data, err := ledger.List(symbol, r.URL.Query().Get("category"), r.URL.Query().Get("bias"), page)
		if err != nil {
			log.Printf("archive read: %v", err)
			http.Error(w, "archive unavailable", 500)
			return
		}
		current.RLock()
		data["recording_error"] = current.ArchiveError
		data["tracking_error"] = current.TrackingError
		data["paper_error"] = current.PaperError
		current.RUnlock()
		json.NewEncoder(w).Encode(data)
	})
	mux.HandleFunc("GET /api/market/radar/archive/{id}/research", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
		if err != nil || id <= 0 {
			http.Error(w, "invalid id", 400)
			return
		}
		result, err := ledger.Research(id)
		if errors.Is(err, sql.ErrNoRows) {
			http.Error(w, "archive not found", 404)
			return
		}
		if err != nil {
			log.Printf("research read: %v", err)
			http.Error(w, "research unavailable", 500)
			return
		}
		json.NewEncoder(w).Encode(result)
	})
	server := &http.Server{Addr: "127.0.0.1:8082", Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		server.Shutdown(shutdown)
	}()
	log.Print("read-only market radar listening on 127.0.0.1:8082")
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}
