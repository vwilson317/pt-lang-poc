package main

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"pt-lang-poc/server/internal/jobs"
)

func main() {
	manager := jobs.NewManager(2, 8, 10*time.Minute)
	defer manager.Close()

	mux := http.NewServeMux()
	mux.HandleFunc("/jobs", withCORS(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}
		if err := r.ParseMultipartForm(120 << 20); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid multipart form"})
			return
		}
		file, _, err := r.FormFile("file")
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing file field"})
			return
		}
		defer file.Close()

		tmp, err := os.CreateTemp("", "pt-clip-*.mp4")
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not create temp file"})
			return
		}
		tmpPath := tmp.Name()
		if _, err := io.Copy(tmp, file); err != nil {
			_ = tmp.Close()
			_ = os.Remove(tmpPath)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not persist upload"})
			return
		}
		_ = tmp.Close()

		jobID, err := manager.CreateJob(tmpPath)
		if err != nil {
			_ = os.Remove(tmpPath)
			if errors.Is(err, jobs.ErrQueueFull) {
				writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "Try again in a moment"})
				return
			}
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not queue job"})
			return
		}

		writeJSON(w, http.StatusAccepted, map[string]string{"jobId": jobID})
	}))

	mux.HandleFunc("/jobs/", withCORS(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}
		path := strings.TrimPrefix(r.URL.Path, "/jobs/")
		path = filepath.Clean(path)
		if path == "." || path == "/" || path == "" {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
			return
		}
		parts := strings.Split(path, "/")
		jobID := parts[0]
		job, ok := manager.GetJob(jobID)
		if !ok {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "job not found"})
			return
		}

		if len(parts) == 1 {
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"jobId":     job.ID,
				"status":    job.Status,
				"message":   job.Message,
				"createdAt": job.CreatedAt.UnixMilli(),
			})
			return
		}

		if len(parts) == 2 && parts[1] == "result" {
			if job.Status != jobs.StatusDone || job.Result == nil {
				writeJSON(w, http.StatusConflict, map[string]string{"error": "result not ready"})
				return
			}
			writeJSON(w, http.StatusOK, job.Result)
			manager.PurgeJob(jobID) // Optional early purge after result fetch.
			return
		}

		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
	}))

	addr := ":8080"
	log.Printf("server listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}

func writeJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func withCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next(w, r)
	}
}
