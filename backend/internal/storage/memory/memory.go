package memory

import (
	"context"
	"sort"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/basicrecords/backend/internal/domain"
)

// Store is an in-memory data store to unblock early iterations before SQLite lands.
type Store struct {
	mu      sync.RWMutex
	events  []domain.Event
	metrics []domain.Metric
}

// NewStore seeds the store with a minimal dataset so the UI can render immediately.
func NewStore() *Store {
	seedEvents := []domain.Event{
		{
			ID:         uuid.NewString(),
			Title:      "晨跑 + 冷水澡",
			Content:    "5km 慢跑，冷水澡 3 分钟，感觉专注度拉满。",
			Mood:       "Focused",
			Tags:       []string{"健康", "晨间例行"},
			MediaRefs:  []string{"file:///Users/me/fitness/2024-05-12-run.gpx"},
			OccurredAt: time.Now().Add(-6 * time.Hour),
		},
		{
			ID:         uuid.NewString(),
			Title:      "午间复盘",
			Content:    "和交易教练复盘两笔亏损，调整出场纪律。",
			Mood:       "Calm",
			Tags:       []string{"理财", "复盘"},
			MediaRefs:  []string{"file:///Users/me/memos/2024-05-12-notes.md"},
			OccurredAt: time.Now().Add(-2 * time.Hour),
		},
	}

	baseDate := time.Now().AddDate(0, 0, -6)
	seedMetrics := make([]domain.Metric, 0, 7)
	for i := 0; i < 7; i++ {
		seedMetrics = append(seedMetrics, domain.Metric{
			ID:     uuid.NewString(),
			Sheet:  "health",
			Name:   "活力指数",
			Date:   baseDate.AddDate(0, 0, i),
			Open:   70 + float64(i),
			High:   72 + float64(i),
			Low:    68 + float64(i),
			Close:  71 + float64(i),
			Events: []string{},
		})
	}

	return &Store{events: seedEvents, metrics: seedMetrics}
}

// ListEvents returns the latest events.
func (s *Store) ListEvents(_ context.Context, limit int) ([]domain.Event, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if limit <= 0 || limit > len(s.events) {
		limit = len(s.events)
	}

	// return newest first
	cloned := append([]domain.Event(nil), s.events...)
	sort.Slice(cloned, func(i, j int) bool {
		return cloned[i].OccurredAt.After(cloned[j].OccurredAt)
	})

	return cloned[:limit], nil
}

// CreateEvent persists a new event in memory.
func (s *Store) CreateEvent(_ context.Context, input domain.CreateEventInput) (domain.Event, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	evt := domain.Event{
		ID:         uuid.NewString(),
		Title:      input.Title,
		Content:    input.Content,
		Mood:       input.Mood,
		Tags:       append([]string(nil), input.Tags...),
		MediaRefs:  append([]string(nil), input.MediaRefs...),
		OccurredAt: time.Now(),
	}

	s.events = append(s.events, evt)
	return evt, nil
}

// ListMetrics returns candlesticks for the requested number of days.
func (s *Store) ListMetrics(_ context.Context, days int) ([]domain.Metric, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if days <= 0 || days > len(s.metrics) {
		days = len(s.metrics)
	}

	latest := s.metrics[len(s.metrics)-days:]
	cloned := append([]domain.Metric(nil), latest...)
	sort.Slice(cloned, func(i, j int) bool {
		return cloned[i].Date.Before(cloned[j].Date)
	})
	return cloned, nil
}
