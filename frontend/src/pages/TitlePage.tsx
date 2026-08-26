import { Link } from "react-router-dom";

function TitlePage() {
  return (
    <section>
      <h1>タイトル</h1>
      <Link to="/connect">はじめる</Link>
    </section>
  );
}

export default TitlePage;
