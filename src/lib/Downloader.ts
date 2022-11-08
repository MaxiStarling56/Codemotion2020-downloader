import os from 'os';
import got from 'got';
import fastq from 'fastq';
import logUpdate from 'log-update';
import { pipeline } from 'stream/promises';
import { existsSync, createWriteStream, mkdirSync } from 'fs';
import { title } from 'process';

export default class Downloader {
	private path: string;
	private queue;

	constructor(conf?: { path?: string; concurrency?: number }) {
		this.path = conf?.path ?? 'downloads';
		this.queue = fastq.promise(
			this.downloadUrl,
			conf?.concurrency ?? os.cpus().length
		);
	}

	public downloadUrls = async (
		urls: { title: string; mp4: string; poster: string }[]
	) => {
		urls.forEach((url) => this.queue.push({ title: url.title, url: url.mp4 }));
		await this.queue.drained();
	};

	private downloadUrl = async (arg: { title: string; url: string }) => {
		const wantedPath = `${this.path}/`;

		if (!existsSync(wantedPath)) mkdirSync(wantedPath, { recursive: true });

		const downloadStream = got.stream(arg.url);
		const fileWriterStream = createWriteStream(
			`${wantedPath}/${arg.title}.mp4`
		);

		downloadStream.on('downloadProgress', ({ percent }) =>
			this.handleProgress(arg.url, percent)
		);

		return await pipeline(downloadStream, fileWriterStream);
	};

	handleProgress = (filename: string, percent: number) => {
		logUpdate(`Download '${filename}'... (${Math.round(percent * 100)}%)`);

		if (percent == 1) {
			logUpdate.clear();
			console.log(`File '${filename}' scaricato!`);
		}
	};
}
