.PHONY: dev prod build stop clean

dev:   ## Arranca el editor en http://localhost:5173 con hot reload
	docker compose up --build dev

prod:  ## Arranca el build optimizado en http://localhost:8080
	docker compose --profile prod up --build -d prod

stop:
	docker compose --profile prod down

clean:
	docker compose --profile prod down -v --rmi local
