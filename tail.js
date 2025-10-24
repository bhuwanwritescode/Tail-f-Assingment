// tail.js (updated)
const fs = require('fs');
const events = require('events');

const NUM_LINES = 10;

class LogWatcher extends events.EventEmitter {
    constructor(file) {
        super();
        this.file = file;
        this.lastLog = null;
        this.lastLines = null;
        this.lastSize = null;
    }

    async getLastNLines(n = NUM_LINES) {
        if (this.lastLines !== null) {
            return this.lastLines.slice(-n);
        }

        try {
            const stats = await fs.promises.stat(this.file);
            let fileSize = stats.size;
            let chunkSize = 4096;
            let position = fileSize;
            let lines = [];

            const fd = await fs.promises.open(this.file, "r");

            while (lines.length < n && position > 0) {
                let readSize = Math.min(chunkSize, position);
                position -= readSize;
                const buffer = Buffer.alloc(readSize);

                await fd.read(buffer, 0, readSize, position);
                let chunkLines = buffer.toString("utf8").trim().split("\n");
                lines = [...chunkLines, ...lines];

                if (lines.length >= n) break;
            }

            await fd.close();
            const computedLines = lines.slice(-n);
            this.lastLines = computedLines;
            return computedLines;
        } catch (err) {
            console.error("Error reading last lines:", err);
            return [];
        }
    }

    start() {
        this.lastSize = fs.statSync(this.file).size;

        fs.watch(this.file, (eventType, filename) => {
            if (eventType !== 'change') return;

            fs.stat(this.file, (err, curr) => {
                if (err) {
                    console.error("Error getting file stats:", err);
                    return;
                }

                if (curr.size <= this.lastSize) return;

                const diff = curr.size - this.lastSize;
                const buffer = Buffer.alloc(diff);

                fs.open(this.file, "r", (err, fd) => {
                    if (err) {
                        console.error("Error opening file:", err);
                        return;
                    }

                    fs.read(fd, buffer, 0, buffer.length, this.lastSize, (err, bytesRead) => {
                        if (err) {
                            console.error("Error reading file:", err);
                            fs.close(fd, () => {});
                            return;
                        }

                        if (bytesRead > 0) {
                            const newLogs = buffer.toString("utf8")
                                .split("\n")
                                .filter(l => l.trim() !== "");

                            if (newLogs.length > 0) {
                                if (this.lastLog !== newLogs[0]) {
                                    newLogs.forEach(line => {
                                        this.emit("log-update", line);
                                        if (this.lastLines !== null) {
                                            this.lastLines.push(line);
                                            if (this.lastLines.length > NUM_LINES) {
                                                this.lastLines.shift();
                                            }
                                        }
                                    });
                                }
                                this.lastLog = newLogs[newLogs.length - 1];
                            }
                        }

                        this.lastSize = curr.size;
                        fs.close(fd, () => {});
                    });
                });
            });
        });
    }
}

module.exports = LogWatcher;