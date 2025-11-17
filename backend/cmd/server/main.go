package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/basicrecords/backend/internal/api"
	"github.com/basicrecords/backend/internal/storage/memory"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	addr := os.Getenv("LDS_ADDR")
	if addr == "" {
		addr = ":8080"
	}

	store := memory.NewStore()
	srv := api.NewServer(api.Config{Addr: addr}, store)

	if err := srv.Run(ctx); err != nil {
		log.Fatalf("server stopped: %v", err)
	}
}
