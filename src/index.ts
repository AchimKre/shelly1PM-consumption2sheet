

export interface Env {
	SHELLY_URL: string;
	SHELLY_AUTH_KEY: string;
	SHELLY_IDS: string;
	GOOGLE_FORM_URL: string;
	GOOGLE_FORM_ENTRIES: string;
	ENABLE_WEB: boolean;
}

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		const { protocol, pathname } = new URL(request.url);
		console.log(pathname);
		if (env.ENABLE_WEB) {
			if (request.method === 'POST') {
				if (pathname === '/report') {
					return await this.report(env);
				} else {
					return await this.post(request, env, ctx);
				}
			} else if (pathname === '/') {
				return await this.get(request, env, ctx);
			} else {
				return new Response("Not Found.", { status: 404 });
			}
		} else {
			return new Response("There is nothing here yet", { status: 404 });
		}
	},
	async get(
		request: Request,
		env: Env,
		ctx: ExecutionContext
	): Promise<Response> {
		var currentdate = new Date().toLocaleDateString('en-US');
		const html = `<!DOCTYPE html>
		<body>
		  <h1>Import</h1>
		  <form action="/" method="post">
			<label for="date_from">Date:</label>
			<input type="date_from2" id="date_from2" name="date_from2" value="2023-04-26 00:00:00"><br><br>
			<input type="date_to" id="date_to" name="date_to" value="${currentdate}"><br><br>
			<input type="submit" value="Submit">
			</form>
			<h1>Report Current Status</h1>
		  <form action="/report" method="post">
			<input type="submit" value="Report">
			</form>
		</body>`;

		return new Response(html, {
      		headers: {
        		"content-type": "text/html;charset=UTF-8",
      		},
		});
	},
	async post(
		request: Request,
		env: Env,
		ctx: ExecutionContext
	): Promise<Response> {
		const formData = await request.formData();
		const dateTo = formData.get("date_to");
		if (!dateTo) {
			return new Response("date_to missing.", { status: 400 }); 
		}
		
		const consumptions = await this.getShelly(env, dateTo);
		await this.reportToSheet(env, consumptions);
		
		return new Response(consumptions.map(consumption => `Shelly ${consumption.shellyId}: ${consumption.data.total} <br>`).join());
	},
	async getShelly(
		env: Env,
		dateTo: string,
	) : Promise<Consumption[]> {
		const shellyIds = env.SHELLY_IDS.split(",")
		const formEntries = env.GOOGLE_FORM_ENTRIES.split(",")
		let config : ShellyToFormEntry[] = new Array;
		for (let i = 0; i < shellyIds.length; i++) {
			const shelly = shellyIds[i];
			config.push({shellyId: shellyIds[i], formEntry: formEntries[i]});
		}
		
		return await Promise.all(config.map(async config => {
			async function gatherResponse(response: Response) {
				const { headers } = response;
				return await response.json() as Consumption;
			}
			const params = new URLSearchParams();
			params.append('id', config.shellyId);
			params.append('channel', '0');
			params.append('date_range', 'custom');
			const today = new Date()
			today.setHours(0, 0, 0, 0);
			const tomorrow = new Date();
			tomorrow.setDate(today.getDate() + 1);
			console.log("date_from", this.formatDate(today) + ' 00:00:00')
			params.append('date_from', this.formatDate(today) + ' 00:00:00');
			console.log("date_to", this.formatDate(tomorrow) + ' 00:00:00')
			params.append('date_to', this.formatDate(tomorrow) + ' 00:00:00');
			params.append('auth_key', env.SHELLY_AUTH_KEY);
	
			const init = {
				headers: {
					"content-type": "application/x-www-form-urlencoded;charset=UTF-8",
				},
				method: 'POST',
				body: params,
			};
	
			const response = await fetch(env.SHELLY_URL, init);
			const results = await gatherResponse(response);
			results.shellyId = config.shellyId;
			results.formEntry = config.formEntry;
			console.log(JSON.stringify(results, null, 2));
			return results;
		}))
	},
	formatDate(date: Date) {
		var d = new Date(date),
			month = '' + (d.getMonth() + 1),
			day = '' + d.getDate(),
			year = d.getFullYear();
	
		if (month.length < 2) 
			month = '0' + month;
		if (day.length < 2) 
			day = '0' + day;
	
		return [year, month, day].join('-');
	},
	async report(
		env: Env
	): Promise<Response> {
		const consumtions = await this.getShelly(env, '2023-12-31 23:59:59');
		await this.reportToSheet(env, consumtions);
		return new Response("OKAY!");
	},
	async reportToSheet(
		env: Env,
		consumptions : Consumption[]
	) {
		console.log("ZZZZZZ");
		const url = env.GOOGLE_FORM_URL;
		const params = new URLSearchParams();
		consumptions.forEach(consumption => {
			let total = consumption.data.total;
			if (consumption.data.units.consumption === 'Wh') {
				total = total / 1000;
			}
			params.append(consumption.formEntry, `${total}`);
		})
		const init = {
			headers: {
				"content-type": "application/x-www-form-urlencoded;charset=UTF-8",
			},
			method: 'POST',
			body: params,
		};
		const response = await fetch(url, init);
		const results = await response.text();
		console.log("result123: ", results);
	},
	async scheduled(
		controller: any, 
		env: Env,
		ctx: ExecutionContext,) {
			console.log("cron processed");
			await this.report(env);
	},
};


interface Consumption {
	data: ConsumptionData,
	shellyId: string,
	formEntry: string,
}

interface ConsumptionData {
	history: ConsumptionHistory[],
	total: number,
	units: ConsumptionDataUnit,
}
interface ConsumptionDataUnit {
	consumption: string,
}

interface ConsumptionHistory {
	datetime: string,
	consumption: string,
	available: boolean,
}

interface ShellyToFormEntry {
	shellyId: string,
	formEntry: string,
}