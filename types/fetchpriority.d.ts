// React 18.2 does not know the camelCase fetchPriority prop. It logs a warning
// for it on every page and asks for the lowercase spelling, which it passes to
// the DOM as a custom attribute. React 18.3 and 19 accept fetchPriority.
// Delete this file and go back to fetchPriority after that upgrade.
import 'react'

declare module 'react' {
	interface ImgHTMLAttributes<T> {
		fetchpriority?: 'high' | 'low' | 'auto'
	}

	interface LinkHTMLAttributes<T> {
		fetchpriority?: 'high' | 'low' | 'auto'
	}
}
