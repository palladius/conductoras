serve:
	@echo "Starting Git History Arcade Server..."
	python3 bin/arcade_server.py

webtest:
	@echo "Running web tests..."
	npx playwright test tests/webtest.spec.js
