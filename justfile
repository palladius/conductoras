serve:
	@echo "Starting Git History Arcade Server..."
	python3 bin/arcade_server.py

webtest:
	@echo "Running web tests..."
	npx playwright test tests/webtest.spec.js

animate:
	python3 bin/animate_conductor_csv.py conductor.csv --max-rows 250
