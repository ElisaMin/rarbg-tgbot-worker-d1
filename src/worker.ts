
import { router } from './router/router';
import { Dao } from './misc/the_dao';

export interface Env {
	rarbg:D1Database
}
async function handle(request: Request, env: Env) {
	Dao.setDB(env.rarbg)
	return router.handle(request, env)
}
export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		try {
			return await handle(request, env)
		} catch (e) {
			let content = e.stack || e.message || e.toString()
			console.error("error content!",content)
			// @ts-ignore
			return new Response(content, { status: 500 })
		}
	}
}
