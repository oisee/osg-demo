"""Mails the built books to a Kindle address through Gmail's SMTP.

Reads GMAIL_ADDRESS, GMAIL_APP_PASSWORD (a Google app password, not the
account password) and KINDLE_EMAIL from the environment, and the files to
send from argv. Amazon delivers only mail from an address on the account's
Approved Personal Document E-mail List. Exits 0 without sending when a
setting is missing, so a fork or a repository without the secrets still
releases.
"""
import mimetypes
import os
import smtplib
import sys
from email.message import EmailMessage

sender = os.environ.get("GMAIL_ADDRESS", "").strip()
password = os.environ.get("GMAIL_APP_PASSWORD", "").strip()
kindle = os.environ.get("KINDLE_EMAIL", "").strip()
files = sys.argv[1:]
if not (sender and password and kindle):
    print("::warning::send-to-kindle: GMAIL_ADDRESS, GMAIL_APP_PASSWORD or KINDLE_EMAIL not set; nothing sent")
    sys.exit(0)
if not files:
    sys.exit("send-to-kindle: no files given")

tag = os.environ.get("RELEASE_TAG", "").strip() or "latest"
for path in files:
    # one book per mail: Kindle lists each attachment as its own document,
    # and a failure names the file it concerns
    message = EmailMessage()
    message["From"] = sender
    message["To"] = kindle
    message["Subject"] = f"osg-demo book {tag}: {os.path.basename(path)}"
    message.set_content(f"The Airship Fleet, osg-demo {tag}.")
    kind, _ = mimetypes.guess_type(path)
    maintype, subtype = (kind or "application/epub+zip").split("/", 1)
    with open(path, "rb") as f:
        message.add_attachment(f.read(), maintype=maintype, subtype=subtype, filename=os.path.basename(path))
    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
        smtp.login(sender, password)
        smtp.send_message(message)
    print(f"send-to-kindle: sent {os.path.basename(path)}")
