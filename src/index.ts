import { writeFile } from 'fs/promises';
import { Cluster } from 'puppeteer-cluster';
import Downloader from './lib/Downloader';

// @ts-ignore
import json from '../debug/step2.json';

(async () => {
	await new Downloader().downloadUrls(json);
	console.log('Step3: OK!');

	process.exit();

	// Step 0: inizializzazione cluster
	const cluster = await Cluster.launch({
		concurrency: Cluster.CONCURRENCY_PAGE,
		maxConcurrency: 2,
		puppeteerOptions: {
			headless: false,
		},
	});

	// Step 1: per ogni video prendi l'url dell'iframe ed i suoi metadati
	await cluster.task(async ({ page, data: url }) => {
		await page.goto(url, { waitUntil: 'domcontentloaded' });

		return await page.evaluate(() => {
			// La seguente funzione verrà runnata all'interno dell'istanza del browser
			return [
				// @ts-ignore
				...document.getElementsByClassName('fl-video fl-embed-video'),
			].map((i) => ({
				iframe_url: [...i.getElementsByTagName('iframe')][0].src,
			}));
			/* // Attualmente la pagina non contine i metadati corretti
			.map((i) => {
				let ret = {};
				[...i.getElementsByTagName('meta')].map((meta) => (ret[meta.getAttribute('itemprop')] = meta.content));
				ret.iframe_url = [...i.getElementsByTagName('iframe')][0].src;
				return ret;
			}); */
		});
	});

	let step1: { iframe_url: string }[] = [];
	await cluster
		.execute('https://extra.codemotion.com/conference-milan-2022-videos/')
		.then((ret) => {
			step1 = ret;
			console.log('Step1: OK!');
		})
		.catch((err) => console.error(err));

	await cluster.idle();
	await writeFile('./debug/step1.json', JSON.stringify(step1));

	// Step 2: per ogni iframe prendi l'url mp4
	await cluster.task(async ({ page, data: url }) => {
		await page.goto(url, { waitUntil: 'domcontentloaded' });
		await page.waitForXPath('/html/head/script[3]/text()');

		return await page.evaluate(() => {
			// @ts-ignore
			const text = document
				.querySelector('head > script:nth-child(6)')
				// @ts-ignore
				.innerText.replace('window.__INITIAL_STATE__ =', '')
				.replaceAll('\n', '')
				.replaceAll(' ', '');

			const parsed = JSON.parse(
				text
					.replace('window.__INITIAL_STATE__ =', '')
					.replaceAll('\n', '')
					.replaceAll(' ', '')
			).media;

			const posterUrl = parsed.playlist[0].image;
			const hdStreamUrl = parsed.playlist[0].sources
				// @ts-ignore
				.sort((a, b) => a.filesize - b.filesize)
				.pop().file;

			return { title: parsed.title, mp4: hdStreamUrl, poster: posterUrl };
		});
	});

	let step2Falliti: any[] = [];
	let step2: { title: string; mp4: string; poster: string }[] =
		await Promise.all(
			step1.map(({ iframe_url }) =>
				cluster
					.execute(iframe_url)
					.catch((err) => step2Falliti.push(iframe_url))
			)
		);
	console.log('Step2: OK!');

	await cluster.idle();
	await cluster.close();

	await writeFile('./debug/step2.json', JSON.stringify(step2));
	await writeFile('./debug/step2-falliti.json', JSON.stringify(step2Falliti));

	// Step 3: scarica i video mp4
	await new Downloader().downloadUrls(step2);
	console.log('Step3: OK!');

	// Step 4: fine
})()
	.catch(console.error)
	.finally(() => process.exit());
