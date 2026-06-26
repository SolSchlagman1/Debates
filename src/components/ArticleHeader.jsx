export default function ArticleHeader({ story }) {
  return (
    <article className="article-header">
      <p className="article-section">{story.section}</p>
      <h1 className="article-headline">{story.headline}</h1>
      <p className="article-dek">{story.dek}</p>
      <p className="article-meta">{story.date}</p>

      <div className="article-body">
        {story.details.map((paragraph) => (
          <p key={paragraph.slice(0, 24)}>{paragraph}</p>
        ))}
      </div>

      <div className="article-question">
        <span className="article-question-label">The question</span>
        <p>{story.question}</p>
      </div>
    </article>
  )
}
