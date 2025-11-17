package api

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"

	"github.com/basicrecords/backend/internal/domain"
)

// Store abstracts the persistence layer so we can swap memory/SQLite easily.
type Store interface {
	ListEvents(ctx context.Context, limit int) ([]domain.Event, error)
	CreateEvent(ctx context.Context, input domain.CreateEventInput) (domain.Event, error)
	ListMetrics(ctx context.Context, days int) ([]domain.Metric, error)
}

// Config wraps the knobs that impact runtime behavior.
type Config struct {
	Addr string
}

// Server exposes the Fiber application.
type Server struct {
	app   *fiber.App
	store Store
	cfg   Config
}

// NewServer wires handlers and middleware.
func NewServer(cfg Config, store Store) *Server {
	app := fiber.New(fiber.Config{
		DisableStartupMessage: true,
		ReadTimeout:           15 * time.Second,
		WriteTimeout:          15 * time.Second,
	})
	app.Use(recover.New())
	app.Use(logger.New(logger.Config{Format: "${time} | ${status} | ${latency} | ${method} ${path}\n"}))
	app.Use(cors.New())

	srv := &Server{app: app, store: store, cfg: cfg}
	srv.registerRoutes()
	return srv
}

// Run starts listening for HTTP traffic until the context is cancelled.
func (s *Server) Run(ctx context.Context) error {
	go func() {
		<-ctx.Done()
		_ = s.app.Shutdown()
	}()

	log.Printf("local data service listening on %s", s.cfg.Addr)
	return s.app.Listen(s.cfg.Addr)
}

func (s *Server) registerRoutes() {
	s.app.Get("/healthz", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	api := s.app.Group("/api/v1")
	api.Get("/events", s.handleListEvents)
	api.Post("/events", s.handleCreateEvent)
	api.Get("/metrics/daily", s.handleListMetrics)
}

func (s *Server) handleListEvents(c *fiber.Ctx) error {
	ctx := c.UserContext()
	limit := c.QueryInt("limit", 10)
	items, err := s.store.ListEvents(ctx, limit)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, fmt.Sprintf("list events: %v", err))
	}

	return c.JSON(fiber.Map{
		"data": items,
		"meta": fiber.Map{"count": len(items)},
	})
}

func (s *Server) handleCreateEvent(c *fiber.Ctx) error {
	ctx := c.UserContext()
	var payload domain.CreateEventInput
	if err := c.BodyParser(&payload); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid payload")
	}
	if payload.Title == "" {
		return fiber.NewError(fiber.StatusBadRequest, "title is required")
	}

	evt, err := s.store.CreateEvent(ctx, payload)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, fmt.Sprintf("create event: %v", err))
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": evt})
}

func (s *Server) handleListMetrics(c *fiber.Ctx) error {
	ctx := c.UserContext()
	days := c.QueryInt("days", 7)
	items, err := s.store.ListMetrics(ctx, days)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, fmt.Sprintf("list metrics: %v", err))
	}
	return c.JSON(fiber.Map{"data": items, "meta": fiber.Map{"count": len(items)}})
}
