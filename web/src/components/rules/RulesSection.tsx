import styles from "./RulesSection.module.css";

const RULES = [
  { n: "01", title: "One wallet gets one press.", body: "The contract remembers. Switching browsers changes nothing." },
  { n: "02", title: "A press resets the clock to 60.", body: "Your transaction buys nobody anything. It only changes shared time." },
  { n: "03", title: "At zero, it ends forever.", body: "If nobody reaches the chain before the deadline, the experiment is over." },
  { n: "04", title: "The contract cannot rescue you.", body: "After activation there is no admin reset, extension, fee switch or upgrade." }
];

export default function RulesSection() {
  return (
    <section id="rules">
      <div className={styles.head}>
        <span className={styles.eyebrow}>THE RULES</span>
        <h2>Four lines. No rescue clause.</h2>
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
      <p className={styles.fineprint}>Gas is paid in ETH on Robinhood Chain. BUTTON ownership is not required to participate.</p>
    </section>
  );
}
