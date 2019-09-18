// Reference: Go in Practice chapter 4

type ParseError struct {
    Message string
    Line, Char int
}
func (p *ParseError) Error() string {
    format := "%s o1n Line %d, Char %d"
    return fmt.Sprintf(format, p.Message, p.Line, p.Char)
}