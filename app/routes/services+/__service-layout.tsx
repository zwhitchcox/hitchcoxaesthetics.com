import { useLocation } from '@remix-run/react'
import Logo from '#app/components/logo.js'
import { scrollToId } from '#app/utils/misc.js'
import { CTA } from '#app/utils/cta.js'

export function ServiceHeader({ children }: { children: React.ReactNode }) {
	return <h2 className="text-3xl font-semibold text-gray-700">{children}</h2>
}

export function ServiceCheckMarks({
	bulletPoints,
}: {
	bulletPoints: { title: string; description: string }[]
}) {
	return (
		<ul className="list-none space-y-4 rounded-md bg-white p-4 shadow-md">
			{bulletPoints.map((point, index) => (
				<li key={index} className="flex flex-col space-y-2">
					<h3 className="text-xl font-semibold text-gray-800">
						<span className="mr-2 text-blue-500">✔️</span>
						{point.title}
					</h3>
					<p className="text-lg text-gray-600">{point.description}</p>
				</li>
			))}
		</ul>
	)
}

export function ServiceFAQ({
	faq,
}: {
	faq: { question: string; answer: string }[]
}) {
	return (
		<ul className="mx-auto max-w-2xl space-y-4">
			{faq.map(item => (
				<li key={item.question} className="rounded-md bg-white p-4 shadow-md">
					<h3 className="mb-2 text-lg font-semibold text-gray-800">
						{item.question}
					</h3>
					<p className="text-gray-700">{item.answer}</p>
				</li>
			))}
		</ul>
	)
}

export function ServiceParagraph({ children }: { children: React.ReactNode }) {
	return <p className="text-lg leading-relaxed text-gray-600">{children}</p>
}

export function ServiceLayout({
	title,
	description,
	children,
}: {
	title: string
	description: string
	children: React.ReactNode
}) {
	const location = useLocation()
	const service = location.pathname.split('/').pop()
	return (
		<>
			<div className="font-poppins flex w-full flex-col bg-white">
				<div className="relative h-[100dvh] w-full flex-col overflow-hidden sm:flex sm:flex-row">
					<div className="flex flex-1 items-center justify-center bg-[#070707] sm:[clip-path:polygon(0_0,_100%_0,_90%_100%,_0%_100%)] ">
						<img
							src={`/img/${service}/before.jpg`}
							alt={`Sarah Hitchcox ${title} Before`}
							className="before-image absolute top-0 z-10 mt-[-3rem] h-auto max-w-full translate-y-[7%] object-contain"
						/>
						<img
							src={`/img/${service}/after.jpg`}
							alt={`Sarah Hitchcox ${title} After`}
							className="after-image absolute top-0 z-10 mt-[-3rem] h-auto max-w-full translate-y-[7%] object-contain"
						/>
					</div>
					<div className="absolute bottom-0 z-10 w-full bg-white py-4 text-black sm:relative sm:my-0 sm:flex-1">
						<div className="flex h-full w-full animate-slide-top flex-col items-center justify-center space-y-4 [animation-fill-mode:backwards] lg:space-y-8">
							<div className="flex flex-col items-center justify-center">
								<div className="animate-fade-in whitespace-nowrap text-xl tracking-[.4rem] md:text-2xl lg:text-3xl">
									{title}
								</div>
								<Logo className="my-2 h-8 w-8 animate-spin-in text-primary [animation-fill-mode:backwards] md:h-10 md:w-10 lg:h-10 lg:w-10" />
								<div className="text-md text-center tracking-[.3rem] text-gray-600 sm:tracking-[.3rem] md:text-xl">
									{description}
								</div>
							</div>
							<div className="flex flex-col items-center justify-center space-y-2">
								<a
									className="text-md mx-2 my-1 w-48 rounded-md bg-gray-800 px-3 py-2 text-center font-semibold text-white transition duration-300 ease-in-out hover:bg-black sm:w-48 sm:text-lg"
									href="https://hitchcoxaesthetics.janeapp.com"
								>
									Book Now
								</a>
								<button
									className="text-md mx-2 my-1 w-48 rounded-md bg-gray-800 px-3 py-2 text-center font-semibold text-white transition duration-300 ease-in-out hover:bg-black sm:w-48 sm:text-lg"
									onClick={() => scrollToId(service!)}
								>
									Learn More
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>
			<div
				id={service!}
				className="bg-gray-50 px-6 py-12 pb-32 sm:px-12 lg:px-24"
			>
				<div className="flex w-full flex-col items-center justify-center space-y-12">
					<div className="w-full max-w-2xl space-y-8">
						<h1 className="text-center text-5xl font-bold text-gray-800">
							{title} | Knoxville
						</h1>
						<div className="flex flex-col space-y-6">{children}</div>
					</div>
				</div>
			</div>
			<CTA />
		</>
	)
}
