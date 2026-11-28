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
// webhook: every address that is not public (notPublicIP), unless the admin
// started the service with NIGARI_IMPORT_ALLOW_PRIVATE=1.
//
// It used to be localIP alone, and let through the shared carrier range
// (100.64.0.0/10), the reserved ranges and IPv4 carried inside IPv6, so
// 64:ff9b::7f00:1 reached 127.0.0.1 through a NAT64 gateway (#1129, found by
// the security review of spec 027 phase 2). The owner chose to close them
// (2026-11-28). The cost falls on an import from a Tailscale machine
// (100.x.y.z), which now needs the switch; the refusal names it.
func blockedIP(ip net.IP) bool {
	if allowPrivateImport {
		return false
	}
	return notPublicIP(ip)
}

// localIP is the guard imports and webhooks have always had: loopback,
// private networks, link-local (which is where 169.254.169.254 lives, the
// metadata service of many providers), multicast and the unspecified address.
func localIP(ip net.IP) bool {
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() || ip.IsInterfaceLocalMulticast() ||
		ip.IsMulticast() || ip.IsUnspecified()
}

// notPublicIPNets are ranges that are not public though localIP lets them
// through (security review, spec 027 phase 2).
var notPublicIPNets = func() []*net.IPNet {
	var out []*net.IPNet
	for _, cidr := range []string{
		"0.0.0.0/8",       // "this network"; 0.0.0.0 is localIP's already
		"100.64.0.0/10",   // shared carrier space (CGNAT, Tailscale)
		"192.0.0.0/24",    // protocol assignments
		"198.18.0.0/15",   // benchmarking
		"240.0.0.0/4",     // reserved, and broadcast
		"fec0::/10",       // site-local, deprecated but still routed in places
		"64:ff9b:1::/48",  // local-use NAT64
		"::/96",           // IPv4-compatible (::7f00:1), deprecated
		"::ffff:0:0:0/96", // SIIT (::ffff:0:a.b.c.d)
		"2001::/32",       // Teredo, whose IPv4 address is obfuscated
		"100::/64",        // discard
	} {
		_, n, _ := net.ParseCIDR(cidr)
		out = append(out, n)
	}
	return out
}()

// notPublicIP is everything that is not publicly routable: localIP's ranges,
// notPublicIPNets, and an IPv4 address carried inside an IPv6 one (NAT64
// 64:ff9b::/96 and 6to4 2002::/16), judged by the IPv4 address it carries,
// so 64:ff9b::7f00:1 is the 127.0.0.1 it reaches.
//
// It has no switch. A fetch a stranger can cause without signing in (a client
// metadata document, spec 027) uses it directly: the admin's permission for
// imports from their own network is a permission for the people they let
// import, not for anyone who can reach /oauth/authorize.
func notPublicIP(ip net.IP) bool {
	if localIP(ip) {
		return true
	}
	for _, n := range notPublicIPNets {
		if n.Contains(ip) {
			return true
		}
	}
	if v6 := ip.To16(); v6 != nil && ip.To4() == nil {
		var embedded net.IP
		switch {
		case v6[0] == 0x00 && v6[1] == 0x64 && v6[2] == 0xff && v6[3] == 0x9b && isZero(v6[4:12]):
			embedded = net.IPv4(v6[12], v6[13], v6[14], v6[15])
		case v6[0] == 0x20 && v6[1] == 0x02:
			embedded = net.IPv4(v6[2], v6[3], v6[4], v6[5])
		}
		if embedded != nil && notPublicIP(embedded) {
			return true
		}
	}
	return false
}

func isZero(b []byte) bool {
	for _, c := range b {
		if c != 0 {
			return false
		}
	}
	return true
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
	return dialChecked(ctx, network, addr, blockedIP,
		" Whoever runs this server can allow addresses on its own network (a Tailscale machine, say) by starting it with NIGARI_IMPORT_ALLOW_PRIVATE=1.")
}

// publicDial is safeDial without the admin's switch: public addresses only,
// always (see notPublicIP).
func publicDial(ctx context.Context, network, addr string) (net.Conn, error) {
	return dialChecked(ctx, network, addr, notPublicIP, "")
}

// dialChecked resolves, refuses the whole name if any address is blocked, and
// dials one of the addresses it checked. hint ends the refusal: how the
// operator can open this up, where they can.
func dialChecked(ctx context.Context, network, addr string, blocked func(net.IP) bool, hint string) (net.Conn, error) {
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
			return nil, errNotPublic{host: host, ip: ip, hint: hint}
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

// errNotPublic is the guard's refusal. A type, so a caller with little room
// for the reason (a webhook's status line, cut at 120 characters) can say
// the part that matters, the switch included, instead of losing it at the end.
type errNotPublic struct {
	host string
	ip   net.IP
	hint string
}

func (e errNotPublic) Error() string {
	return fmt.Sprintf("refusing to fetch from %s (%s): only public addresses are allowed, "+
		"so this server cannot be made to reach a private network.%s", e.host, e.ip, e.hint)
}

// short is the refusal in a few words, for a status line.
func (e errNotPublic) short() string {
	if e.hint == "" {
		return fmt.Sprintf("refused %s: not a public address", e.ip)
	}
	return fmt.Sprintf("refused %s: not a public address (NIGARI_IMPORT_ALLOW_PRIVATE=1 allows it)", e.ip)
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
