class SpeedTest {
    constructor() {
        this.startButton = document.getElementById('start-test');
        this.speedValue = document.getElementById('speed-value');
        this.downloadSpeed = document.getElementById('download-speed');
        this.uploadSpeed = document.getElementById('upload-speed');
        this.ping = document.getElementById('ping');
        this.testStatus = document.getElementById('test-status');
        this.loadingContainer = document.querySelector('.loading-container');
        
        this.startButton.addEventListener('click', () => this.startTest());
        this.initialize();
    }

    initialize() {
        // Test servers for better accuracy
        this.testServers = [
            'https://eu.httpbin.org/stream-bytes',
            'https://httpbin.org/stream-bytes',
            'https://asia.httpbin.org/stream-bytes'
        ];

        // Different file sizes for more accurate testing
        this.testSizes = [
            1 * 1024 * 1024,  // 1MB
            2 * 1024 * 1024,  // 2MB
            5 * 1024 * 1024,  // 5MB
            10 * 1024 * 1024, // 10MB
            25 * 1024 * 1024  // 25MB
        ];

        this.results = {
            download: [],
            upload: [],
            ping: []
        };

        // Initialize connection info
        this.checkConnectionType();
    }

    checkConnectionType() {
        if ('connection' in navigator) {
            const connection = navigator.connection;
            console.log('Connection type:', connection.effectiveType);
            this.adjustTestParameters(connection.effectiveType);

            connection.addEventListener('change', () => {
                this.adjustTestParameters(connection.effectiveType);
            });
        }
    }

    adjustTestParameters(connectionType) {
        switch(connectionType) {
            case 'slow-2g':
            case '2g':
                this.testSizes = this.testSizes.slice(0, 2); // Use only smaller files
                break;
            case '3g':
                this.testSizes = this.testSizes.slice(0, 3);
                break;
            case '4g':
            default:
                // Use all test sizes
                break;
        }
    }

    async startTest() {
        try {
            this.startButton.disabled = true;
            this.startButton.textContent = 'Testing...';
            this.resetValues();
            this.showLoading(true);

            // Measure ping first
            this.updateStatus('Measuring ping...');
            await this.measurePing();
            
            // Run download tests with different file sizes
            this.updateStatus('Testing download speed...');
            for (const size of this.testSizes) {
                await this.testDownloadSpeed(size);
                await new Promise(resolve => setTimeout(resolve, 200));
            }

            // Run upload tests
            this.updateStatus('Testing upload speed...');
            for (const size of this.testSizes.slice(0, 2)) {
                await this.testUploadSpeed(size);
                await new Promise(resolve => setTimeout(resolve, 200));
            }

            this.updateStatus('Calculating results...');
            this.calculateFinalResults();
            this.updateStatus('Test complete');
        } catch (error) {
            console.error('Test failed:', error);
            this.handleError(error);
        } finally {
            this.startButton.disabled = false;
            this.startButton.textContent = 'Start Test';
            this.showLoading(false);
        }
    }

    resetValues() {
        this.results = {
            download: [],
            upload: [],
            ping: []
        };
        this.updateDisplay(0, '-', '-', '-');
        this.updateStatus('Starting test...');
    }

    showLoading(show) {
        if (show) {
            this.loadingContainer.classList.add('active');
        } else {
            this.loadingContainer.classList.remove('active');
        }
    }

    updateStatus(status) {
        this.testStatus.textContent = status;
    }

    updateDisplay(speed, download, upload, ping) {
        this.speedValue.textContent = speed;
        this.downloadSpeed.textContent = download;
        this.uploadSpeed.textContent = upload;
        this.ping.textContent = ping;
    }

    async testDownloadSpeed(size) {
        console.log('Starting download test with size:', size);
        const speeds = [];
        
        for (const server of this.testServers) {
            try {
                const startTime = performance.now();
                let bytesReceived = 0;
                
                // Add random parameter and chunk size to prevent caching
                const testUrl = `${server}/${size}?chunk_size=65536&r=${Math.random()}`;
                const response = await fetch(testUrl, {
                    cache: 'no-store',
                    mode: 'cors'
                });
                const reader = response.body.getReader();
                
                while (true) {
                    const {done, value} = await reader.read();
                    if (done) break;
                    bytesReceived += value.length;
                    this.updateProgress(bytesReceived, size, startTime);
                }
                
                const endTime = performance.now();
                const speed = this.calculateSpeed(bytesReceived, startTime, endTime);
                
                if (speed > 0) { // Accept any positive speed
                    speeds.push(speed);
                    this.results.download.push(speed);
                    this.updateSpeedValue(speed);
                }
                
                // Break if we got a good speed measurement
                if (speed > 0) break;
                
            } catch (error) {
                console.error(`Download test failed for ${server}:`, error);
                // Continue with next server
                continue;
            }
        }
        
        if (speeds.length === 0) {
            throw new Error('All download tests failed');
        }
    }

    async testUploadSpeed(size) {
        const speeds = [];
        const data = new Uint8Array(size);
        const blob = new Blob([data]);
        
        const uploadUrls = [
            'https://eu.httpbin.org/post',
            'https://httpbin.org/post',
            'https://asia.httpbin.org/post'
        ];
        
        for (const url of uploadUrls) {
            try {
                const startTime = performance.now();
                
                const response = await fetch(url, {
                    method: 'POST',
                    body: blob,
                    headers: {
                        'Content-Type': 'application/octet-stream'
                    }
                });
                
                const endTime = performance.now();
                const speed = this.calculateSpeed(size, startTime, endTime);
                
                if (speed > 0) { // Accept any positive speed
                    speeds.push(speed);
                    this.results.upload.push(speed);
                }
                
                // Break if we got a good speed measurement
                if (speed > 0) break;
                
            } catch (error) {
                console.error(`Upload test failed for ${url}:`, error);
                // Continue with next server
                continue;
            }
        }
        
        if (speeds.length === 0) {
            throw new Error('All upload tests failed');
        }
    }

    async measurePing() {
        const pings = [];
        for (let i = 0; i < 3; i++) {
            const startTime = performance.now();
            try {
                await fetch('https://eu.httpbin.org/get?cache=' + Math.random());
                const endTime = performance.now();
                pings.push(endTime - startTime);
            } catch (error) {
                console.error('Ping test failed:', error);
            }
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        this.results.ping = pings.filter(p => p < 1000); // Filter out anomalies
    }

    calculateSpeed(bytes, startTime, endTime) {
        const durationInSeconds = (endTime - startTime) / 1000;
        if (durationInSeconds <= 0) return 0;
        
        const bitsTransferred = bytes * 8;
        const rawSpeed = (bitsTransferred / durationInSeconds) / (1024 * 1024); // Mbps
        
        // Apply correction factor based on network overhead
        const overhead = 1.1; // Account for TCP/IP overhead
        return Math.min(rawSpeed * overhead, 1000); // Cap at 1000 Mbps
    }

    updateProgress(received, total, startTime) {
        const currentTime = performance.now();
        const currentSpeed = this.calculateSpeed(received, startTime, currentTime);
        this.updateSpeedValue(currentSpeed);
        
        // Calculate and show progress percentage
        const progress = Math.round((received / total) * 100);
        this.updateStatus(`Testing... ${progress}% complete`);
    }

    calculateFinalResults() {
        const getAverageSpeed = arr => {
            // Remove outliers using IQR method
            const sorted = [...arr].sort((a, b) => a - b);
            const q1 = sorted[Math.floor(sorted.length / 4)];
            const q3 = sorted[Math.floor(sorted.length * 3 / 4)];
            const iqr = q3 - q1;
            const validSpeeds = sorted.filter(x => x >= q1 - 1.5 * iqr && x <= q3 + 1.5 * iqr);
            
            // Calculate weighted average (recent results count more)
            let sum = 0;
            let weightSum = 0;
            validSpeeds.forEach((speed, i) => {
                const weight = i + 1;
                sum += speed * weight;
                weightSum += weight;
            });
            
            return sum / weightSum;
        };

        if (this.results.download.length > 0) {
            const downloadSpeed = getAverageSpeed(this.results.download);
            this.speedValue.textContent = downloadSpeed.toFixed(1);
            this.downloadSpeed.textContent = `${downloadSpeed.toFixed(1)} Mbps`;
        }

        if (this.results.upload.length > 0) {
            const uploadSpeed = getAverageSpeed(this.results.upload);
            this.uploadSpeed.textContent = `${uploadSpeed.toFixed(1)} Mbps`;
        }

        if (this.results.ping.length > 0) {
            // For ping, use the lowest values (excluding outliers)
            const sorted = [...this.results.ping].sort((a, b) => a - b);
            const validPings = sorted.slice(0, Math.ceil(sorted.length * 0.8)); // Use best 80%
            const avgPing = validPings.reduce((a, b) => a + b, 0) / validPings.length;
            this.ping.textContent = `${Math.round(avgPing)} ms`;
        }
    }

    handleError(error) {
        this.updateDisplay('Error', 'Failed', 'Failed', 'Failed');
        this.updateStatus('Test failed. Please try again.');
    }

    updateSpeedValue(speed) {
        this.speedValue.textContent = speed.toFixed(1);
    }
}

// Initialize the speed test when the page loads
window.addEventListener('load', () => {
    new SpeedTest();
});
