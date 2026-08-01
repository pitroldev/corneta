//! Camada de compatibilidade mínima sobre `ureq` 3.
//!
//! Centraliza a API tipada do ureq 3 e, principalmente, preserva o corpo de
//! respostas HTTP 4xx/5xx. Os fluxos OAuth usam esses corpos para traduzir o
//! erro localmente, mas nunca os escrevem em telemetria ou logs.

use std::fmt;
use std::io::Read;
use std::time::Duration;

#[derive(Debug)]
pub enum Error {
    Status(u16, Box<Response>),
    Transport(ureq3::Error),
    Usage(&'static str),
}

impl fmt::Display for Error {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Status(code, _) => write!(formatter, "HTTP status {code}"),
            Self::Transport(error) => error.fmt(formatter),
            Self::Usage(message) => formatter.write_str(message),
        }
    }
}

impl std::error::Error for Error {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Transport(error) => Some(error),
            Self::Status(_, _) | Self::Usage(_) => None,
        }
    }
}

#[derive(Debug)]
pub struct Response(ureq3::http::Response<ureq3::Body>);

impl Response {
    pub fn status(&self) -> u16 {
        self.0.status().as_u16()
    }

    pub fn into_string(self) -> Result<String, Error> {
        self.0
            .into_body()
            .read_to_string()
            .map_err(Error::Transport)
    }

    pub fn into_reader(self) -> impl Read {
        self.0.into_body().into_reader()
    }
}

#[derive(Clone, Copy)]
enum Method {
    Get,
    Post,
    Put,
    Patch,
    Delete,
}

pub struct Request {
    agent: Option<ureq3::Agent>,
    method: Method,
    url: String,
    headers: Vec<(String, String)>,
    timeout: Option<Duration>,
}

impl Request {
    fn new(agent: Option<ureq3::Agent>, method: Method, url: impl ToString) -> Self {
        Self {
            agent,
            method,
            url: url.to_string(),
            headers: Vec::new(),
            timeout: None,
        }
    }

    pub fn set(mut self, name: &str, value: &str) -> Self {
        self.headers.push((name.to_owned(), value.to_owned()));
        self
    }

    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.timeout = Some(timeout);
        self
    }

    fn configure<B>(&self, mut request: ureq3::RequestBuilder<B>) -> ureq3::RequestBuilder<B> {
        for (name, value) in &self.headers {
            request = request.header(name, value);
        }
        request
            .config()
            .timeout_global(self.timeout)
            .http_status_as_error(false)
            .build()
    }

    fn response(
        result: Result<ureq3::http::Response<ureq3::Body>, ureq3::Error>,
    ) -> Result<Response, Error> {
        let response = Response(result.map_err(Error::Transport)?);
        let status = response.status();
        if (400..=599).contains(&status) {
            Err(Error::Status(status, Box::new(response)))
        } else {
            Ok(response)
        }
    }

    pub fn call(self) -> Result<Response, Error> {
        let result = match self.method {
            Method::Get => {
                let request = match &self.agent {
                    Some(agent) => agent.get(&self.url),
                    None => ureq3::get(&self.url),
                };
                self.configure(request).call()
            }
            Method::Delete => {
                let request = match &self.agent {
                    Some(agent) => agent.delete(&self.url),
                    None => ureq3::delete(&self.url),
                };
                self.configure(request).call()
            }
            Method::Post => {
                let request = match &self.agent {
                    Some(agent) => agent.post(&self.url),
                    None => ureq3::post(&self.url),
                };
                self.configure(request).send_empty()
            }
            Method::Put => {
                let request = match &self.agent {
                    Some(agent) => agent.put(&self.url),
                    None => ureq3::put(&self.url),
                };
                self.configure(request).send_empty()
            }
            Method::Patch => {
                let request = match &self.agent {
                    Some(agent) => agent.patch(&self.url),
                    None => ureq3::patch(&self.url),
                };
                self.configure(request).send_empty()
            }
        };
        Self::response(result)
    }

    pub fn send_string(self, body: &str) -> Result<Response, Error> {
        self.send_bytes(body.as_bytes())
    }

    fn send_bytes(self, body: &[u8]) -> Result<Response, Error> {
        let result = match self.method {
            Method::Get => {
                let request = match &self.agent {
                    Some(agent) => agent.get(&self.url),
                    None => ureq3::get(&self.url),
                };
                self.configure(request).force_send_body().send(body)
            }
            Method::Delete => {
                let request = match &self.agent {
                    Some(agent) => agent.delete(&self.url),
                    None => ureq3::delete(&self.url),
                };
                self.configure(request).force_send_body().send(body)
            }
            Method::Post => {
                let request = match &self.agent {
                    Some(agent) => agent.post(&self.url),
                    None => ureq3::post(&self.url),
                };
                self.configure(request).send(body)
            }
            Method::Put => {
                let request = match &self.agent {
                    Some(agent) => agent.put(&self.url),
                    None => ureq3::put(&self.url),
                };
                self.configure(request).send(body)
            }
            Method::Patch => {
                let request = match &self.agent {
                    Some(agent) => agent.patch(&self.url),
                    None => ureq3::patch(&self.url),
                };
                self.configure(request).send(body)
            }
        };
        Self::response(result)
    }

    pub fn send_form(self, form: &[(&str, &str)]) -> Result<Response, Error> {
        let Method::Post = self.method else {
            return Err(Error::Usage("form body requires POST"));
        };
        let request = match &self.agent {
            Some(agent) => agent.post(&self.url),
            None => ureq3::post(&self.url),
        };
        let request = self.configure(request);
        Self::response(request.send_form(form.iter().copied()))
    }

    pub fn send<R: Read + 'static>(self, body: R) -> Result<Response, Error> {
        let Method::Post = self.method else {
            return Err(Error::Usage("streaming body requires POST"));
        };
        let request = match &self.agent {
            Some(agent) => agent.post(&self.url),
            None => ureq3::post(&self.url),
        };
        let request = self.configure(request);
        Self::response(request.send(ureq3::SendBody::from_owned_reader(body)))
    }
}

pub fn get(url: impl ToString) -> Request {
    Request::new(None, Method::Get, url)
}

pub fn post(url: impl ToString) -> Request {
    Request::new(None, Method::Post, url)
}

pub fn delete(url: impl ToString) -> Request {
    Request::new(None, Method::Delete, url)
}

pub fn request(method: &str, url: impl ToString) -> Request {
    let method = match method {
        "POST" => Method::Post,
        "PUT" => Method::Put,
        "PATCH" => Method::Patch,
        "DELETE" => Method::Delete,
        _ => Method::Get,
    };
    Request::new(None, method, url)
}

pub struct AgentBuilder {
    timeout_write: Option<Duration>,
    timeout_read: Option<Duration>,
}

impl AgentBuilder {
    pub fn new() -> Self {
        Self {
            timeout_write: None,
            timeout_read: None,
        }
    }

    pub fn timeout_write(mut self, timeout: Duration) -> Self {
        self.timeout_write = Some(timeout);
        self
    }

    pub fn timeout_read(mut self, timeout: Duration) -> Self {
        self.timeout_read = Some(timeout);
        self
    }

    pub fn build(self) -> Agent {
        let config = ureq3::Agent::config_builder()
            .timeout_send_request(self.timeout_write)
            .timeout_send_body(self.timeout_write)
            .timeout_recv_response(self.timeout_read)
            .timeout_recv_body(self.timeout_read)
            .http_status_as_error(false)
            .build();
        Agent(ureq3::Agent::new_with_config(config))
    }
}

pub struct Agent(ureq3::Agent);

impl Agent {
    pub fn post(&self, url: impl ToString) -> Request {
        Request::new(Some(self.0.clone()), Method::Post, url)
    }
}

#[cfg(test)]
mod tests {
    use super::{get, Error};
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::time::Duration;

    #[test]
    fn status_error_preserves_body_for_local_oauth_translation() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind local test server");
        let address = listener.local_addr().expect("read local test address");
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept local request");
            stream
                .set_read_timeout(Some(Duration::from_secs(2)))
                .expect("set read timeout");
            let mut request = [0_u8; 2048];
            let read = stream.read(&mut request).expect("read local request");
            assert!(String::from_utf8_lossy(&request[..read]).starts_with("GET /oauth HTTP/1.1"));
            stream
                .write_all(
                    b"HTTP/1.1 400 Bad Request\r\nContent-Length: 7\r\nConnection: close\r\n\r\n{\"x\":1}",
                )
                .expect("write local response");
        });

        let result = get(format!("http://{address}/oauth"))
            .timeout(Duration::from_secs(2))
            .call();
        match result {
            Err(Error::Status(400, response)) => {
                assert_eq!(response.into_string().expect("read response"), "{\"x\":1}");
            }
            other => panic!("unexpected response: {other:?}"),
        }
        server.join().expect("join local test server");
    }
}
