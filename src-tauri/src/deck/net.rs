//! Request guards for the one Corneta server that listens beyond loopback.

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

/// Home and loopback addresses only; a forwarded router port must not reach the deck.
pub fn is_private_peer(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => private_v4(v4),
        IpAddr::V6(v6) => match v6.to_ipv4_mapped() {
            Some(v4) => private_v4(v4),
            None => private_v6(v6),
        },
    }
}

fn private_v4(ip: Ipv4Addr) -> bool {
    ip.is_loopback() || ip.is_private() || ip.is_link_local()
}

fn private_v6(ip: Ipv6Addr) -> bool {
    let first = ip.segments()[0];
    // fc00::/7 is unique local, fe80::/10 is link local.
    ip.is_loopback() || (first & 0xfe00) == 0xfc00 || (first & 0xffc0) == 0xfe80
}

/// The page is always opened by IP from the QR. Refusing host names blocks DNS rebinding,
/// where a hostile site resolves its own name to this PC to read the deck.
pub fn host_allowed(host: Option<&str>, port: u16) -> bool {
    let Some(host) = host else {
        return false;
    };
    let Some((name, host_port)) = host.rsplit_once(':') else {
        return false;
    };
    if host_port.parse::<u16>().ok() != Some(port) {
        return false;
    }
    name == "localhost" || name.parse::<Ipv4Addr>().is_ok()
}

/// Browsers send Origin on WebSocket upgrades; only the deck page itself may connect.
pub fn origin_allowed(origin: Option<&str>, host: &str) -> bool {
    origin.is_some_and(|origin| origin == format!("http://{host}"))
}

/// A served asset name: one path segment from the build output, never an HTML page.
pub fn asset_name_allowed(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 120
        && !name.starts_with('.')
        && !name.ends_with(".html")
        && name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-' | b'_'))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_home_and_loopback_peers_reach_the_deck() {
        for ip in [
            "192.168.0.12",
            "10.0.0.5",
            "172.20.1.9",
            "127.0.0.1",
            "169.254.3.4",
            "::1",
            "fd12::1",
            "fe80::1",
            "::ffff:192.168.1.2",
        ] {
            assert!(is_private_peer(ip.parse().unwrap()), "{ip}");
        }
        for ip in [
            "8.8.8.8",
            "172.32.0.1",
            "100.64.0.1",
            "2001:4860::8888",
            "::ffff:8.8.8.8",
        ] {
            assert!(!is_private_peer(ip.parse().unwrap()), "{ip}");
        }
    }

    #[test]
    fn the_page_is_reached_by_ip_and_port_only() {
        assert!(host_allowed(Some("192.168.0.12:7394"), 7394));
        assert!(host_allowed(Some("localhost:7394"), 7394));
        assert!(!host_allowed(Some("192.168.0.12:7395"), 7394));
        assert!(!host_allowed(Some("evil.example:7394"), 7394));
        assert!(!host_allowed(Some("192.168.0.12"), 7394));
        assert!(!host_allowed(None, 7394));
    }

    #[test]
    fn websockets_must_come_from_the_deck_page() {
        assert!(origin_allowed(
            Some("http://192.168.0.12:7394"),
            "192.168.0.12:7394"
        ));
        assert!(!origin_allowed(
            Some("http://evil.example"),
            "192.168.0.12:7394"
        ));
        assert!(!origin_allowed(
            Some("https://192.168.0.12:7394"),
            "192.168.0.12:7394"
        ));
        assert!(!origin_allowed(None, "192.168.0.12:7394"));
    }

    #[test]
    fn asset_names_stay_inside_the_build_output() {
        assert!(asset_name_allowed("deck-Bx81_qQ.js"));
        assert!(asset_name_allowed("inter-latin-wght-normal-Dx4kXJAl.woff2"));
        for name in [
            "",
            "../config.json",
            "a/b.js",
            ".env",
            "index.html",
            "x?y.js",
        ] {
            assert!(!asset_name_allowed(name), "{name}");
        }
    }
}
