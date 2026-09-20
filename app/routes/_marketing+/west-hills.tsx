import { redirect } from '@remix-run/node'

// The West Hills office closed on 2026-09-20 (Zane). Its page sends visitors
// and search engines to the default office, Bearden. The office stays in
// app/config/locations.json, marked closed, for its GBP and citation ids.
export function loader() {
	return redirect('/bearden', 301)
}
