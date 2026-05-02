import { Link } from "react-router-dom";

type Props = { title: string; body?: string };

export function PlaceholderPage({ title, body }: Props) {
  return (
    <section className="lv-panel">
      <h2 className="lv-h2">{title}</h2>
      <p className="lv-muted">{body ?? "This section is a placeholder for a future release."}</p>
      <p>
        <Link to="/review">Go to requirement review</Link>
      </p>
    </section>
  );
}
