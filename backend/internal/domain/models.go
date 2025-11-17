package domain

import "time"

// Event captures a single journal entry enriched with metadata and media references.
type Event struct {
	ID         string    `json:"id"`
	Title      string    `json:"title"`
	Content    string    `json:"content"`
	Mood       string    `json:"mood"`
	Tags       []string  `json:"tags"`
	MediaRefs  []string  `json:"mediaRefs"`
	OccurredAt time.Time `json:"occurredAt"`
}

// CreateEventInput is the payload for creating new events.
type CreateEventInput struct {
	Title     string   `json:"title"`
	Content   string   `json:"content"`
	Mood      string   `json:"mood"`
	Tags      []string `json:"tags"`
	MediaRefs []string `json:"mediaRefs"`
}

// Metric models an OHLC style data point for K-line rendering.
type Metric struct {
	ID     string    `json:"id"`
	Sheet  string    `json:"sheet"`
	Name   string    `json:"name"`
	Date   time.Time `json:"date"`
	Open   float64   `json:"open"`
	High   float64   `json:"high"`
	Low    float64   `json:"low"`
	Close  float64   `json:"close"`
	Events []string  `json:"events"`
}
