import React from 'react';

const SimpleContent = (content) => {
  return <div>{content}</div>;
};

const HtmlContent = (content, mailContext) => {

  const attachments = mailContext.attachments || [];

  const contentWithAttachedAttachments = attachments
    .filter(attachment => attachment.disposition === 'inline')
    .reduce((prevContent, attachment) => {
      return prevContent.replace(
        `cid:${attachment.content_id}`,
        `data:${attachment.type};base64, ${attachment.content}`
      );
    }, content);

  return (
    <div
      dangerouslySetInnerHTML={{ __html: contentWithAttachedAttachments }}
    />
  );
};

const TemplateContent = (templateId, personalizations) => {
  return (
    <div>
      <b>{templateId}</b>

      <div>
        {
          (personalizations || [])
            .map((p, index) => {
              return (
                <div key={index}>
                  <div>
                    <b>to:</b>
                  </div>

                  <div>
                    <ul>
                      {p.to.map(to => (<li key={to.email}>{to.email}</li>))}
                    </ul>
                  </div>

                  <div>
                    <b>template data:</b>
                  </div>

                  <div>
                    {JSON.stringify(p.dynamic_template_data)}
                  </div>
                </div>
              );
            })
        }
      </div>
    </div>
  );
};

const PopUp = (props) => {

  const contentRenderer = {
    'text/plain': SimpleContent,
    'text/html': HtmlContent,
  };

  const renderContent = (type, content, mailContext) => {
    const renderer = contentRenderer[type];

    if (renderer) {
      return renderer(content, mailContext);
    } else {
      return <div>{''}</div>;
    }
  };

  const renderDisplayContent = (displayContent, selectedEmailType) => {
    if (Array.isArray(displayContent)) {
      return (
        <div>
          {displayContent.filter(content => content.type === selectedEmailType).map((content, index) => (
            <div key={index}>
              {
                renderContent(
                  content.type,
                  content.value,
                  props.currentEmail
                )
              }
            </div>
          ))}
        </div>
      );
    } else {
      return <div>{''}</div>;
    }
  };

  return (
    <div className="modal">
      <div className="modal_content">

        <div className="modal_header">
          <h1 className="modal_subject" title={props.currentEmail.subject}>
            {props.currentEmail.subject || '(No Subject)'}
          </h1>
          <button
            className="modal_close"
            onClick={props.hide}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="modal_body">
          {props.currentEmail.template_id ?
            TemplateContent(
              props.currentEmail.template_id,
              props.currentEmail.personalizations
            ) :
            renderDisplayContent(props.currentEmail.displayContent, props.selectedEmailType)
          }
        </div>

      </div>
    </div>
  );
};

export default PopUp;
