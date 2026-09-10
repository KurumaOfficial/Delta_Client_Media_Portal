package validation

import "testing"

func TestVideosPerWeek(t *testing.T) {
	cases := []struct {
		in    string
		valid bool
	}{
		{"2-3 ролика", true},
		{"5 видео в неделю", true},
		{"1-2", true},
		{"3", true},
		{"10 роликов/неделю", true},
		{"abc", false},
		{"", false},
		{"   ", false},
		{"2-3 <script>", false},
		{"5$$$", false},
		{"123@#$", false},
	}

	for _, c := range cases {
		out, ok := VideosPerWeek(c.in)
		if ok != c.valid {
			t.Errorf("FAIL for %q: expected %v, got %v (out: %q)", c.in, c.valid, ok, out)
		}
	}
}

func TestNumericUID(t *testing.T) {
	cases := []struct {
		in    string
		valid bool
	}{
		{"12345", true},
		{"0", true},
		{"999999999", true},
		{"abc", false},
		{"123a", false},
		{"<script>", false},
		{"!@#", false},
		{"", false},
	}

	for _, c := range cases {
		out, ok := NumericUID(c.in)
		if ok != c.valid {
			t.Errorf("FAIL for %q: expected %v, got %v (out: %q)", c.in, c.valid, ok, out)
		}
	}
}
