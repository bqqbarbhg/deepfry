
let jpgEncoder = new JPEGEncoder(10);

let g_ImageCache = { }
function loadImage(src)
{
	if (g_ImageCache[src]) {
		return g_ImageCache[src];
	}

	let promise = new Promise((resolve, reject) => {
		let image = new Image();
		image.onerror = reject;
		image.onload = () => resolve(image);
		image.src = src;
	});
	g_ImageCache[src] = promise;
	return promise;
}

let preload = ['data/b.png', 'data/laser.png', 'data/laserbottom.png', 'data/emoji.png'];
preload.forEach(loadImage);

function createImageFromFile(file)
{
	return new Promise((resolve, reject) => {
		let reader = new FileReader();
		reader.addEventListener('error', () => reject('Failed to read'));
		reader.addEventListener('load', () => {
			let image = new Image();
			image.onerror = () => reject('Failed to load');
			image.onload = () => resolve(image);
			image.src = reader.result;
		});
		reader.readAsDataURL(file);
	});
}

function delay(time)
{
	return new Promise((resolve, reject) => {
		window.setTimeout(resolve, Math.floor(time * 1000.0))
	});
}

function passNoise(canvas, ctx, original, opts)
{
	let data = ctx.getImageData(0, 0, canvas.width, canvas.height);

	let kernel = (data, length) => {
		for (let i = 0; i < length; i++) {
			let val = Math.floor(data[i] + Math.random() * opts.amount - opts.amount / 2.0);
			data[i] = Math.min(Math.max(val, 0), 255);
		}
	};

	kernel(data.data, data.width * data.height * 4);
	ctx.putImageData(data, 0, 0);
	return Promise.resolve();
}

function passTint(canvas, ctx, original, opts)
{
	var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
	var dA = imageData.data;

	var r = opts.r;
	var g = opts.g;
	var b = opts.b;

	for(var i = 0; i < dA.length; i += 4)
	{
		dA[i + 0] += r;
		dA[i + 1] += g;
		dA[i + 2] += b;
	}

	ctx.putImageData(imageData, 0, 0);

	return Promise.resolve();
}

function passSaturation(canvas, ctx, original, opts)
{
	var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
	var dA = imageData.data;

	var sv = opts.amount;

	var luR = 0.3086;
	var luG = 0.6094;
	var luB = 0.0820;

	var az = (1 - sv)*luR + sv;
	var bz = (1 - sv)*luG;
	var cz = (1 - sv)*luB;
	var dz = (1 - sv)*luR;
	var ez = (1 - sv)*luG + sv;
	var fz = (1 - sv)*luB;
	var gz = (1 - sv)*luR;
	var hz = (1 - sv)*luG;
	var iz = (1 - sv)*luB + sv;

	for(var i = 0; i < dA.length; i += 4)
	{
		var red = dA[i];
		var green = dA[i + 1];
		var blue = dA[i + 2];

		var saturatedRed = (az*red + bz*green + cz*blue);
		var saturatedGreen = (dz*red + ez*green + fz*blue);
		var saturateddBlue = (gz*red + hz*green + iz*blue);

		dA[i] = saturatedRed;
		dA[i + 1] = saturatedGreen;
		dA[i + 2] = saturateddBlue;
	}

	ctx.putImageData(imageData, 0, 0);

	return Promise.resolve();
}

function passLaser(canvas, ctx, original, opts)
{
	let doLaser = ([laser, laserbottom]) => new Promise((resolve, reject) => {
		let tracker = new tracking.ObjectTracker('eye');
		tracker.setStepSize(1.7);
		tracker.on('track', e => {
			for (let r of e.data) {
				let size = Math.max(r.width, r.height) * opts.size;
				let px = r.x + r.width / 2.0 - size / 2.0;
				let py = r.y + r.height / 2.0 - size / 2.0;

				ctx.drawImage(laserbottom, px|0, py|0, size|0, size|0);
			}
			for (let r of e.data) {
				let size = Math.max(r.width, r.height) * opts.size;
				let px = r.x + r.width / 2.0 - size / 2.0;
				let py = r.y + r.height / 2.0 - size / 2.0;

				ctx.drawImage(laser, px|0, py|0, size|0, size|0);
			}
			resolve();
		});
		tracking.track(original, tracker);
	});

	return Promise.all([loadImage('data/laser.png'), loadImage('data/laserbottom.png')])
		.then(doLaser);
}

function passB(canvas, ctx, original, opts)
{
	let doB = (b) => new Promise((resolve, reject) => {

		return Tesseract.recognize(original)
			.progress(p => console.log(p))
			.then(r => {
				for (let sym of r.symbols) {
					if (sym.confidence > 80.0 && Math.random() < 0.3 || sym.text.toUpperCase() == 'B') {
						let bb = sym.bbox;
						if (bb.x1 - bb.x0 < canvas.width * 0.2 && bb.y1 - bb.y0 < canvas.height * 0.2)
						{
							let size = Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0) * 1.2;
							let cx = (bb.x0 + bb.x1 - size) / 2;
							let cy = (bb.y0 + bb.y1 - size) / 2;

							ctx.drawImage(b, cx|0, cy|0, size|0, size|0);
						}
					}
				}
				resolve();
			});

	});

	return loadImage('data/b.png')
		.then(doB);
}

function passJpgEncode(canvas, ctx, original, opts)
{
	return new Promise((resolve, reject) => {
		let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
		let rawData = jpgEncoder.encode(imageData, opts.quality, true);
		let blob = new Blob([rawData.buffer], {type: 'image/jpeg'});
		let jpegURI = URL.createObjectURL(blob);
		let im2 = new Image();
		im2.onload = () => {
			ctx.drawImage(im2, 0, 0);
			resolve();
		};
		im2.src = jpegURI;
	});
}

function passEmoji(canvas, ctx, original, opts)
{
	let doEmoji = (emoji) => new Promise((resolve, reject) => {

		let size = Math.min(canvas.width, canvas.height) * opts.size;

		for (let i = 0; i < opts.num; i++) {

			let x = Math.random() * (canvas.width + size) - size;
			let y = Math.random() * (canvas.height + size) - size;
			let sx = Math.floor(Math.random() * emoji.width / emoji.height) * 128;

			ctx.drawImage(emoji, sx, 0, 128, 128, x, y, size, size);
		}

		resolve();
	});

	return loadImage('data/emoji.png')
		.then(doEmoji);
}

function deepFry(image, level)
{
	return new Promise((resolve, reject) => {

		let canvas = document.createElement("canvas");
		canvas.width = image.width;
		canvas.height = image.height;
		let ctx = canvas.getContext('2d');
		ctx.drawImage(image, 0, 0);

		let passes = [];
		//passes.push([passTint, { r: 5.0, g: -5.0, b: -5.0 }]);
		// passes.push([passB, { }]);
		passes.push([passEmoji, { num: 5, size: 0.2 }]);
		passes.push([passSaturation, { amount: 2.0 }]);
		passes.push([passJpgEncode, { quality: 10.0 }]);
		passes.push([passNoise, { amount: 10.0 }]);
		passes.push([passSaturation, { amount: 2.0 }]);
		passes.push([passJpgEncode, { quality: 10.0 }]);
		passes.push([passNoise, { amount: 10.0 }]);
		passes.push([passSaturation, { amount: 2.0 }]);
		passes.push([passJpgEncode, { quality: 10.0 }]);
		passes.push([passNoise, { amount: 10.0 }]);
		passes.push([passJpgEncode, { quality: 10.0 }]);
		passes.push([passNoise, { amount: 10.0 }]);
		passes.push([passJpgEncode, { quality: 10.0 }]);
		passes.push([passNoise, { amount: 10.0 }]);
		passes.push([passSaturation, { amount: 2.0 }]);
		passes.push([passJpgEncode, { quality: 10.0 }]);
		passes.push([passNoise, { amount: 10.0 }]);
		passes.push([passJpgEncode, { quality: 10.0 }]);
		passes.push([passNoise, { amount: 10.0 }]);
		passes.push([passJpgEncode, { quality: 10.0 }]);
		passes.push([passLaser, { size: 14.0 }]);

		let passIndex = 0;

		let loop = () => {
			let index = passIndex++;
			if (index >= passes.length)
				return Promise.resolve();

			return passes[index][0](canvas, ctx, image, passes[index][1])
				.then(loop);
		};

		loop().then(() => resolve(canvas.toDataURL("image/png")));
	});
}

