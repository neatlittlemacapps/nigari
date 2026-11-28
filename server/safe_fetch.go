package server

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"time"
)

// Outbound fetches the server makes on somebody's behalf: a bulk import's
// source (ingest.go), a webhook delivery (webhooks.go) and, since spec 027, an
// OAuth client's metadata document (oauth_cimd.go). Each is a URL somebody
// else chose, so each goes through the same guard: resolve the name, refuse it
// if any of its addresses is not public, and connect to exactly the address
// that was checked. One place, so a fix to the guard reaches every fetch.

// allowPrivateImport opens imports up to private networks. Deliberately ONLY
// through an environment variable at startup (NIGARI_IMPORT_ALLOW_PRIVATE=1), not
// through the API and certainly not through MCP: whoever starts the service
// makes that decision — an agent cannot. Meant for self-hosted sources on your
// own network (your own Jira, your own wiki).
var allowPrivateImport = os.Getenv("NIGARI_IMPORT_ALLOW_PRIVATE") == "1"

// blockedIP decides whether an address is off limits for an import or a
// webhook: every address notPublicIP refuses, unless the admin started the
// service with NIGARI_IMPORT_ALLOW_PRIVATE=1.
func blockedIP(ip net.IP) bool {
	if allowPrivateImport {
		return false
	}
	return notPublicIP(ip)
}

// notPublicIP is everything that is not publicly routable: loopback, private
// networks, link-local (which is where 169.254.169.254 lives, the metadata
// service of many providers), multicast and the unspecified address.
//
// It has no switch. A fetch a stranger can cause without signing in (a client
// metadata document, spec 027) uses it directly: the admin's permission for
// imports from their own network is a permission for the people they let
// import, not for anyone who can reach /oauth/authorize.
func notPublicIP(ip net.IP) bool {
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() || ip.IsInterfaceLocalMulticast() ||
		ip.IsMulticast() || ip.IsUnspecified()
}

// safeDial resolves the name, checks EVERY address and then connects to
// exactly the address it checked.
//
// The second half is the important one: connecting through the name again after
// the check would let an attacker serve a different address between check and
// connection (DNS rebinding), and the check would be worthless. Because the
// dialer runs again on EVERY redirect, this covers redirects to internal
// targets as well.
func safeDial(ctx context.Context, network, addr string) (net.Conn, error) {
	return dialChecked(ctx, network, addr, blockedIP)
}

// publicDial is safeDial without the admin's switch: public addresses only,
// always (see notPublicIP).
func publicDial(ctx context.Context, network, addr string) (net.Conn, error) {
	return dialChecked(ctx, network, addr, notPublicIP)
}

// dialChecked resolves, refuses the whole name if any address is blocked, and
// dials one of the addresses it checked.
func dialChecked(ctx context.Context, network, addr string, blocked func(net.IP) bool) (net.Conn, error) {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return nil, err
	}
	ips, err := net.DefaultResolver.LookupIP(ctx, "ip", host)
	if err != nil {
		return nil, fmt.Errorf("cannot resolve %q", host)
	}
	d := &net.Dialer{Timeout: 10 * time.Second}
	for _, ip := range ips {
		if blocked(ip) {
			return nil, fmt.Errorf("refusing to fetch from %s (%s): only public addresses are allowed, "+
				"so an import cannot be used to reach this server's private network", host, ip)
		}
	}
	var lastErr error
	for _, ip := range ips {
		c, err := d.DialContext(ctx, network, net.JoinHostPort(ip.String(), port))
		if err == nil {
			return c, nil
		}
		lastErr = err
	}
	return nil, lastErr
}

func ingestHTTPClient() *http.Client {
	return &http.Client{
		Timeout:   3 * time.Minute,
		Transport: &http.Transport{DialContext: safeDial},
		CheckRedirect: func(r *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return fmt.Errorf("too many redirects")
			}
			if r.URL.Scheme != "http" && r.URL.Scheme != "https" {
				return fmt.Errorf("refusing to follow a %s:// redirect", r.URL.Scheme)
			}
			return nil
		},
	}
}
