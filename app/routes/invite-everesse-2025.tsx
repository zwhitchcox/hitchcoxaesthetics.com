import { redirect } from "@remix-run/node";

export const loader = () => {
  return redirect("https://forms.gle/1LeENgzZpyNqgZxt8");
};

export default function EveresseDemoRedirect() {
  // In case someone lands client-side, do a JS redirect
  if (typeof window !== "undefined") {
    window.location.href = "https://forms.gle/1LeENgzZpyNqgZxt8";
  }
  return (
    <div>
      <p>
        Redirecting to{" "}
        <a href="https://forms.gle/1LeENgzZpyNqgZxt8">
          this Google Form
        </a>
        ...
      </p>
    </div>
  );
}