package jobs

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"sync"
	"time"
)

var ErrQueueFull = errors.New("job queue is full")

type queuedJob struct {
	ID       string
	FilePath string
}

type Manager struct {
	mu         sync.RWMutex
	jobs       map[string]*Job
	queue      chan queuedJob
	ttl        time.Duration
	processor  *Processor
	cancelFunc context.CancelFunc
}

func NewManager(workerCount int, queueLimit int, ttl time.Duration) *Manager {
	if workerCount < 1 {
		workerCount = 1
	}
	if queueLimit < 1 {
		queueLimit = 4
	}
	ctx, cancel := context.WithCancel(context.Background())
	m := &Manager{
		jobs:       make(map[string]*Job),
		queue:      make(chan queuedJob, queueLimit),
		ttl:        ttl,
		processor:  NewProcessor(),
		cancelFunc: cancel,
	}
	for i := 0; i < workerCount; i++ {
		go m.worker(ctx)
	}
	go m.purgeLoop(ctx)
	return m
}

func (m *Manager) Close() {
	m.cancelFunc()
}

func newID() string {
	var b [8]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

func (m *Manager) CreateJob(filePath string) (string, error) {
	if len(m.queue) >= cap(m.queue) {
		return "", ErrQueueFull
	}
	id := newID()
	job := &Job{
		ID:        id,
		Status:    StatusProcessing,
		CreatedAt: time.Now(),
	}
	m.mu.Lock()
	m.jobs[id] = job
	m.mu.Unlock()
	m.queue <- queuedJob{ID: id, FilePath: filePath}
	return id, nil
}

func (m *Manager) GetJob(id string) (*Job, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	job, ok := m.jobs[id]
	if !ok {
		return nil, false
	}
	clone := *job
	return &clone, true
}

func (m *Manager) worker(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case item := <-m.queue:
			status, message, result := m.processor.Process(ctx, item.ID, item.FilePath)
			m.mu.Lock()
			job, ok := m.jobs[item.ID]
			if ok {
				job.Status = status
				job.Message = message
				job.Result = result
			}
			m.mu.Unlock()
		}
	}
}

func (m *Manager) purgeLoop(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			cutoff := time.Now().Add(-m.ttl)
			m.mu.Lock()
			for id, job := range m.jobs {
				if job.CreatedAt.Before(cutoff) {
					delete(m.jobs, id)
				}
			}
			m.mu.Unlock()
		}
	}
}

func (m *Manager) PurgeJob(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.jobs, id)
}
