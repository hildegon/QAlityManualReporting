# Privacy

QAlity Manual Reporting is a desktop application. It does not include
telemetry, analytics, advertising, or other optional data collection.

## Credentials and local data

Jira and Xray credentials are stored locally in the operating system's
application-data directory. The configuration is encrypted with AES-256-GCM,
and the encryption key is stored separately on the same device. Credentials
and access tokens remain in memory while the application is running and are
not intended to be persisted in plaintext.

The application may also store local preferences and cached application data
on the device. Removing the application or clearing its application data may
be required to remove those files, depending on the operating system.

## Network requests

When configured and used, the application sends requests directly to the Jira,
Xray, and Confluence services selected by the user. These requests can include
reading issue, test, execution, and page data, as well as uploading or
downloading attachments and other files when the user requests those actions.
Those services receive the data necessary to perform the requested operations
and handle it under their own privacy policies and terms.

No application server proxies these requests, and no AI integration is
included in this project.

## Scope

This document describes the application's intended data handling. It does not
replace the privacy policies of Jira, Xray, or any other service connected by
the user.
