import styles from "./RulesSection.module.css";

const RULES = [
  { n: "01", title: "One username gets one press.", body: "The server remembers, permanently, but a username, unlike a wallet, costs nothing to re-create. See the honesty note below." },
  { n: "02", title: "A press resets the clock to 60.", body: "Pressing buys nobody anything. It only changes shared time." },
  { n: "03", title: "At zero, it ends forever.", body: "If nobody presses before the deadline, the experiment is over." },
  {
    n: "04",
    title: "Death at zero cannot be undone.",
    body: "The operator may publicly push the clock back to 60 while the experiment is still alive. Nothing, not even the operator, can revive it once it truly ends."
  }
];

export default function RulesSection() {
  return (
    <section id="rules">
      <div className={styles.head}>
        <span className={styles.eyebrow}>THE RULES</span>
        <h2>Four lines. Nothing hidden.</h2>
      </div>
      <div className={styles.grid}>
        {RULES.map((rule) => (
          <article key={rule.n}>
            <b>{rule.n}</b>
            <h3>{rule.title}</h3>
            <p>{rule.body}</p>
          </article>
        ))}
      </div>
      <p className={styles.fineprint}>
        No wallet, no gas, no transaction. Pressing costs nothing but a username. The honest trade-off: a username is
        permanently spent once used, but unlike a wallet it's free to make a new one. BUTTON ownership is not required
        to participate.
      </p>
    </section>
  );
}
