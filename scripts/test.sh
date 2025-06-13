#!/bin/bash

# Check Node.js version
REQUIRED_NODE_VERSION=22
CURRENT_NODE_VERSION=$(node -v | cut -d'.' -f1 | sed 's/v//')

if ((CURRENT_NODE_VERSION < REQUIRED_NODE_VERSION)); then
    echo "Error: Node.js version must be $REQUIRED_NODE_VERSION or higher. Current version is $CURRENT_NODE_VERSION."
    exit 1
fi

# Build packages first to ensure dependencies are ready
echo -e "\033[1mBuilding packages before testing...\033[0m"
pnpm run build
if [ $? -ne 0 ]; then
    echo -e "\033[1;31mBuild failed, cannot proceed with tests\033[0m"
    exit 1
fi

# Navigate to the script's directory
cd "$(dirname "$0")"/..

# Keep track of test failures
FAILURES=0

# If specific test file provided, run just that
if [[ "$1" == *".ts" ]]; then
    echo -e "\033[1mRunning specific test: $1\033[0m"
    npx vitest run "$1"
    exit $?
fi

# If package name provided, run just that package
if [ ! -z "$1" ]; then
    package="$1"
    package_path="packages/$package"

    if [ ! -d "$package_path" ]; then
        echo -e "\033[1mPackage directory '$package' not found\033[0m"
        exit 1
    fi

    echo -e "\033[1mTesting package: $package\033[0m"
    # Use find to get all test files and pass them explicitly to jest
    test_files=$(find "packages/$package/src" -name "*.test.ts" -type f)
    if [ -z "$test_files" ]; then
        echo "No test files found"
        exit 1
    fi
    echo "Found test files:"
    echo "$test_files"
    npx vitest run $test_files
    exit $?
fi

# Check if the packages directory exists
if [ ! -d "packages" ]; then
    echo "Error: 'packages' directory not found."
    exit 1
fi

# Find all packages under the packages directory
PACKAGES=($(find packages -mindepth 1 -maxdepth 1 -type d -exec basename {} \;))

# Add agent directory to test locations if it exists
if [ -d "agent" ]; then
    echo -e "\033[1mTesting agent directory\033[0m"
    cd "agent" || exit 1

    if [ -f "package.json" ]; then
        if [[ -n "$TEST_COVERAGE" ]] && npm run | grep -q " test:coverage"; then
            echo -e "\033[1mRunning coverage tests for agent\033[0m"
            if npm run test:coverage; then
                echo -e "\033[1;32mSuccessfully tested agent with coverage\033[0m\n"
            else
                echo -e "\033[1;31mCoverage tests failed for agent\033[0m"
                FAILURES=$((FAILURES + 1))
            fi
        elif npm run | grep -q " test"; then
            echo -e "\033[1mRunning tests for agent\033[0m"
            if npm run test; then
                echo -e "\033[1;32mSuccessfully tested agent\033[0m\n"
            else
                echo -e "\033[1;31mTests failed for agent\033[0m"
                FAILURES=$((FAILURES + 1))
            fi
        else
            echo "No test script found in agent, skipping tests..."
        fi
    else
        echo "No package.json found in agent, skipping..."
    fi

    cd - >/dev/null || exit
fi

# Test packages in specified order
for package in "${PACKAGES[@]}"; do
    package_path="packages/$package"

    if [ ! -d "$package_path" ]; then
        echo -e "\033[1mPackage directory '$package' not found, skipping...\033[0m"
        continue
    fi

    echo -e "\033[1mTesting package: $package\033[0m"
    cd "$package_path" || continue

    if [ -f "package.json" ]; then
        # Run tests with coverage if TEST_COVERAGE is set and test:coverage script exists
        if [[ -n "$TEST_COVERAGE" ]] && npm run | grep -q " test:coverage"; then
            echo -e "\033[1mRunning coverage tests for package: $package\033[0m"
            if npm run test:coverage; then
                echo -e "\033[1;32mSuccessfully tested $package with coverage\033[0m\n"
            else
                echo -e "\033[1;31mCoverage tests failed for $package\033[0m"
                FAILURES=$((FAILURES + 1))
            fi
        # Otherwise, run regular tests if available
        elif npm run | grep -q " test"; then
            echo -e "\033[1mRunning tests for package: $package\033[0m"
            if npm run test; then
                echo -e "\033[1;32mSuccessfully tested $package\033[0m\n"
            else
                echo -e "\033[1;31mTests failed for $package\033[0m"
                FAILURES=$((FAILURES + 1))
            fi
        else
            echo "No test script found in $package, skipping tests..."
        fi
    else
        echo "No package.json found in $package, skipping..."
    fi

    cd - >/dev/null || exit
done

echo -e "\033[1mTest process completed.😎\033[0m"

# Exit with failure if any tests failed
if [ $FAILURES -gt 0 ]; then
    echo -e "\033[1;31m$FAILURES package(s) had test failures\033[0m"
    exit 1
fi